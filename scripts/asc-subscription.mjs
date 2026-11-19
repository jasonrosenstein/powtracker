// Creates Powtracker Pro in App Store Connect: the subscription group, the monthly subscription,
// its name and description, its price in every country (Apple's equivalents of the US price),
// where it is sold, and the one-week free trial. Safe to run again: each step looks for what
// already exists first.
// Usage: node scripts/asc-subscription.mjs
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { asc } from './asc.mjs'

const APP = JSON.parse(readFileSync('ios/store/listing.json', 'utf8')).appId
const PRODUCT_ID = 'app.powtracker.pro.monthly'
const US_PRICE = '2.99'

async function must(method, path, body) {
  const res = await asc(method, path, body)
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${JSON.stringify(res.json?.errors?.map((e) => e.detail) ?? res.text.slice(0, 300))}`)
  return res.json
}
/** Every page of a list. */
async function all(path) {
  const out = []
  let next = path
  while (next) {
    const page = await must('GET', next.replace('https://api.appstoreconnect.apple.com', ''))
    out.push(...page.data)
    next = page.links?.next
  }
  return out
}

// 1. The group, and the name subscribers see for it.
const groups = await all(`/v1/apps/${APP}/subscriptionGroups?limit=50`)
let group = groups.find((g) => g.attributes.referenceName === 'Powtracker Pro')
if (!group) {
  group = (await must('POST', '/v1/subscriptionGroups', {
    data: { type: 'subscriptionGroups', attributes: { referenceName: 'Powtracker Pro' }, relationships: { app: { data: { type: 'apps', id: APP } } } },
  })).data
  console.log('created the subscription group')
}
const groupLocs = await all(`/v1/subscriptionGroups/${group.id}/subscriptionGroupLocalizations`)
if (!groupLocs.some((l) => l.attributes.locale === 'en-US')) {
  await must('POST', '/v1/subscriptionGroupLocalizations', {
    data: { type: 'subscriptionGroupLocalizations', attributes: { name: 'Powtracker Pro', locale: 'en-US' }, relationships: { subscriptionGroup: { data: { type: 'subscriptionGroups', id: group.id } } } },
  })
  console.log('named the group for subscribers')
}

// 2. The monthly subscription.
const subs = await all(`/v1/subscriptionGroups/${group.id}/subscriptions?limit=50`)
let sub = subs.find((s) => s.attributes.productId === PRODUCT_ID)
if (!sub) {
  sub = (await must('POST', '/v1/subscriptions', {
    data: {
      type: 'subscriptions',
      attributes: { name: 'Pro Monthly', productId: PRODUCT_ID, subscriptionPeriod: 'ONE_MONTH', familySharable: false, groupLevel: 1 },
      relationships: { group: { data: { type: 'subscriptionGroups', id: group.id } } },
    },
  })).data
  console.log(`created the subscription ${PRODUCT_ID}`)
}
const subLocs = await all(`/v1/subscriptions/${sub.id}/subscriptionLocalizations`)
if (!subLocs.some((l) => l.attributes.locale === 'en-US')) {
  await must('POST', '/v1/subscriptionLocalizations', {
    data: {
      type: 'subscriptionLocalizations',
      attributes: { name: 'Powtracker Pro', description: 'The 14-day outlook, summit forecasts, pass filters', locale: 'en-US' },
      relationships: { subscription: { data: { type: 'subscriptions', id: sub.id } } },
    },
  })
  console.log('named and described the subscription')
}

// 3. Where it is sold: everywhere, including countries Apple adds later.
const availability = await asc('GET', `/v1/subscriptions/${sub.id}/subscriptionAvailability`)
if (!availability.ok || !availability.json?.data) {
  const territories = await all('/v1/territories?limit=200')
  await must('POST', '/v1/subscriptionAvailabilities', {
    data: {
      type: 'subscriptionAvailabilities',
      attributes: { availableInNewTerritories: true },
      relationships: {
        subscription: { data: { type: 'subscriptions', id: sub.id } },
        availableTerritories: { data: territories.map((t) => ({ type: 'territories', id: t.id })) },
      },
    },
  })
  console.log(`available in ${territories.length} countries and regions`)
}

// 4. The price: $2.99 in the United States, and Apple's equivalent of it everywhere else.
const priced = await all(`/v1/subscriptions/${sub.id}/prices?include=territory&limit=200`)
if (priced.length === 0) {
  const usPoints = await all(`/v1/subscriptions/${sub.id}/pricePoints?filter[territory]=USA&limit=200`)
  const us = usPoints.find((p) => p.attributes.customerPrice === US_PRICE)
  if (!us) throw new Error(`no US price point at $${US_PRICE}`)
  const elsewhere = await all(`/v1/subscriptionPricePoints/${us.id}/equalizations?include=territory&limit=200`)
  let set = 0
  for (const point of [us, ...elsewhere]) {
    await must('POST', '/v1/subscriptionPrices', {
      data: {
        type: 'subscriptionPrices',
        attributes: { preserveCurrentPrice: false },
        relationships: { subscription: { data: { type: 'subscriptions', id: sub.id } }, subscriptionPricePoint: { data: { type: 'subscriptionPricePoints', id: point.id } } },
      },
    })
    set++
  }
  console.log(`priced at $${US_PRICE} in the US and its equivalent in ${set - 1} other countries and regions`)
} else {
  console.log(`prices already set in ${priced.length} countries and regions`)
}

// 5. The free trial: one week, once, for new subscribers. Apple keeps one offer per country.
const offers = await all(`/v1/subscriptions/${sub.id}/introductoryOffers?include=territory&limit=200`)
const offered = new Set(offers.map((o) => o.relationships?.territory?.data?.id))
const territories = await all('/v1/territories?limit=200')
let added = 0
for (const territory of territories) {
  if (offered.has(territory.id)) continue
  await must('POST', '/v1/subscriptionIntroductoryOffers', {
    data: {
      type: 'subscriptionIntroductoryOffers',
      attributes: { duration: 'ONE_WEEK', offerMode: 'FREE_TRIAL', numberOfPeriods: 1 },
      relationships: { subscription: { data: { type: 'subscriptions', id: sub.id } }, territory: { data: { type: 'territories', id: territory.id } } },
    },
  })
  added++
}
console.log(`7-day free trial: added in ${added} countries and regions, already present in ${offered.size}`)

// 6. What the reviewer sees: a screenshot of the paywall in the app, and a note on where to find it.
const reviewShot = await asc('GET', `/v1/subscriptions/${sub.id}/appStoreReviewScreenshot`)
if (!reviewShot.ok || !reviewShot.json?.data) {
  const bytes = readFileSync('ios/store/review-paywall.png')
  const reserved = (await must('POST', '/v1/subscriptionAppStoreReviewScreenshots', {
    data: {
      type: 'subscriptionAppStoreReviewScreenshots',
      attributes: { fileName: 'review-paywall.png', fileSize: bytes.length },
      relationships: { subscription: { data: { type: 'subscriptions', id: sub.id } } },
    },
  })).data
  for (const op of reserved.attributes.uploadOperations) {
    const put = await fetch(op.url, { method: op.method, headers: Object.fromEntries(op.requestHeaders.map((h) => [h.name, h.value])), body: bytes.subarray(op.offset, op.offset + op.length) })
    if (!put.ok) throw new Error(`review screenshot upload: HTTP ${put.status}`)
  }
  await must('PATCH', `/v1/subscriptionAppStoreReviewScreenshots/${reserved.id}`, {
    data: { type: 'subscriptionAppStoreReviewScreenshots', id: reserved.id, attributes: { uploaded: true, sourceFileChecksum: createHash('md5').update(bytes).digest('hex') } },
  })
  console.log('uploaded the paywall screenshot for review')
}
await must('PATCH', `/v1/subscriptions/${sub.id}`, {
  data: { type: 'subscriptions', id: sub.id, attributes: { reviewNote: 'Tap "Try Pro" at the top right of the app, or "7 days" in the forecast bar, to open this subscription\'s sheet. It unlocks the 7- and 14-day forecasts, base and summit elevations, season-pass filters, model charts, map layers and unlimited saved mountains.' } },
})

const state = await must('GET', `/v1/subscriptions/${sub.id}`)
console.log(`subscription ${PRODUCT_ID}: ${state.data.attributes.state}`)
