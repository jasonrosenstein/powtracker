// Applies ios/store/listing.json to the app's App Store listing: categories, subtitle, URLs,
// description, keywords, review notes, and the screenshots. Safe to run again: it updates what
// exists and uploads screenshots only when the set is empty.
// Usage: node scripts/asc-listing.mjs [text|screenshots|all]
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { asc } from './asc.mjs'

const listing = JSON.parse(readFileSync('ios/store/listing.json', 'utf8'))
const what = process.argv[2] ?? 'all'

async function must(method, path, body) {
  const res = await asc(method, path, body)
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${JSON.stringify(res.json?.errors?.map((e) => e.detail) ?? res.text.slice(0, 300))}`)
  return res.json
}

if (listing.keywords.length > 100) throw new Error(`keywords are ${listing.keywords.length} characters; the limit is 100`)

const app = await must('GET', `/v1/apps/${listing.appId}?include=appInfos,appStoreVersions`)
const info = app.included.find((x) => x.type === 'appInfos')
const version = app.included.find((x) => x.type === 'appStoreVersions')

if (what === 'text' || what === 'all') {
  await must('PATCH', `/v1/appInfos/${info.id}`, {
    data: {
      type: 'appInfos',
      id: info.id,
      relationships: {
        primaryCategory: { data: { type: 'appCategories', id: listing.primaryCategory } },
        secondaryCategory: { data: { type: 'appCategories', id: listing.secondaryCategory } },
      },
    },
  })
  console.log(`categories: ${listing.primaryCategory}, ${listing.secondaryCategory}`)

  const infoLocs = await must('GET', `/v1/appInfos/${info.id}/appInfoLocalizations`)
  const infoLoc = infoLocs.data.find((l) => l.attributes.locale === listing.locale)
  await must('PATCH', `/v1/appInfoLocalizations/${infoLoc.id}`, {
    data: { type: 'appInfoLocalizations', id: infoLoc.id, attributes: { subtitle: listing.subtitle, privacyPolicyUrl: listing.privacyPolicyUrl } },
  })
  console.log(`subtitle and privacy policy set`)

  const verLocs = await must('GET', `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`)
  const verLoc = verLocs.data.find((l) => l.attributes.locale === listing.locale)
  await must('PATCH', `/v1/appStoreVersionLocalizations/${verLoc.id}`, {
    data: {
      type: 'appStoreVersionLocalizations',
      id: verLoc.id,
      attributes: { description: listing.description, keywords: listing.keywords, promotionalText: listing.promotionalText, supportUrl: listing.supportUrl, marketingUrl: listing.marketingUrl },
    },
  })
  console.log(`description (${listing.description.length} characters), keywords (${listing.keywords.length}), URLs set`)

  await must('PATCH', `/v1/appStoreVersions/${version.id}`, { data: { type: 'appStoreVersions', id: version.id, attributes: { copyright: listing.copyright } } })
  console.log(`copyright: ${listing.copyright}`)

  // Review details: created once, updated afterwards. Apple requires a contact phone number
  // ("+1 …"); it is read from the environment so that it is not kept in the repository.
  const existing = await asc('GET', `/v1/appStoreVersions/${version.id}/appStoreReviewDetail`)
  const attributes = { ...listing.review, ...(process.env.REVIEW_CONTACT_PHONE ? { contactPhone: process.env.REVIEW_CONTACT_PHONE } : {}) }
  if (!attributes.contactPhone && !(existing.ok && existing.json?.data)) {
    console.log('review contact NOT set: Apple requires a phone number (run again with REVIEW_CONTACT_PHONE="+1 …")')
  } else if (existing.ok && existing.json?.data) {
    await must('PATCH', `/v1/appStoreReviewDetails/${existing.json.data.id}`, { data: { type: 'appStoreReviewDetails', id: existing.json.data.id, attributes } })
  } else {
    await must('POST', '/v1/appStoreReviewDetails', {
      data: { type: 'appStoreReviewDetails', attributes, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } } },
    })
    console.log('review notes and contact set')
  }
}

if (what === 'screenshots' || what === 'all') {
  const verLocs = await must('GET', `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`)
  const verLoc = verLocs.data.find((l) => l.attributes.locale === listing.locale)
  const sets = await must('GET', `/v1/appStoreVersionLocalizations/${verLoc.id}/appScreenshotSets?include=appScreenshots`)
  let set = sets.data.find((s) => s.attributes.screenshotDisplayType === listing.screenshots.displayType)
  if (!set) {
    set = (await must('POST', '/v1/appScreenshotSets', {
      data: {
        type: 'appScreenshotSets',
        attributes: { screenshotDisplayType: listing.screenshots.displayType },
        relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: verLoc.id } } },
      },
    })).data
  }
  const have = (sets.included ?? []).filter((s) => s.type === 'appScreenshots').length
  if (have > 0) {
    console.log(`screenshots: ${have} already uploaded, left as they are`)
  } else {
    for (const file of listing.screenshots.files) {
      const bytes = readFileSync(`ios/store/${file}`)
      // Reserve the upload, send the bytes where Apple says, then confirm with a checksum.
      const reserved = (await must('POST', '/v1/appScreenshots', {
        data: {
          type: 'appScreenshots',
          attributes: { fileName: file.split('/').pop(), fileSize: bytes.length },
          relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: set.id } } },
        },
      })).data
      for (const op of reserved.attributes.uploadOperations) {
        const put = await fetch(op.url, {
          method: op.method,
          headers: Object.fromEntries(op.requestHeaders.map((h) => [h.name, h.value])),
          body: bytes.subarray(op.offset, op.offset + op.length),
        })
        if (!put.ok) throw new Error(`upload of ${file}: HTTP ${put.status}`)
      }
      await must('PATCH', `/v1/appScreenshots/${reserved.id}`, {
        data: { type: 'appScreenshots', id: reserved.id, attributes: { uploaded: true, sourceFileChecksum: createHash('md5').update(bytes).digest('hex') } },
      })
      console.log(`uploaded ${file}`)
    }
  }
}
