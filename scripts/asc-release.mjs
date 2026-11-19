// Gets version 1.0 ready to send to App Review: the app itself is free, it is offered in every
// country, and the newest processed build is attached to the version. It does not submit.
// Safe to run again. Usage: node scripts/asc-release.mjs
import { readFileSync } from 'node:fs'
import { asc } from './asc.mjs'

const APP = JSON.parse(readFileSync('ios/store/listing.json', 'utf8')).appId
async function must(method, path, body) {
  const res = await asc(method, path, body)
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${JSON.stringify(res.json?.errors?.map((e) => e.detail) ?? res.text.slice(0, 300))}`)
  return res.json
}
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

// 1. The app is free to download (Pro is the in-app subscription).
const schedule = await asc('GET', `/v1/apps/${APP}/appPriceSchedule?include=manualPrices`)
if (!schedule.ok || !(schedule.json?.included ?? []).length) {
  const points = await all(`/v1/apps/${APP}/appPricePoints?filter[territory]=USA&limit=200`)
  const free = points.find((p) => Number(p.attributes.customerPrice) === 0)
  if (!free) throw new Error('no free price point for the United States')
  await must('POST', '/v1/appPriceSchedules', {
    data: {
      type: 'appPriceSchedules',
      relationships: {
        app: { data: { type: 'apps', id: APP } },
        baseTerritory: { data: { type: 'territories', id: 'USA' } },
        manualPrices: { data: [{ type: 'appPrices', id: '${free}' }] },
      },
    },
    included: [{ type: 'appPrices', id: '${free}', attributes: { startDate: null }, relationships: { appPricePoint: { data: { type: 'appPricePoints', id: free.id } } } }],
  })
  console.log('price: free')
} else {
  console.log('price: already set')
}

// 2. Offered everywhere, including countries Apple adds later.
const availability = await asc('GET', `/v1/apps/${APP}/appAvailabilityV2`)
if (!availability.ok || !availability.json?.data) {
  const territories = await all('/v1/territories?limit=200')
  await must('POST', '/v2/appAvailabilities', {
    data: {
      type: 'appAvailabilities',
      attributes: { availableInNewTerritories: true },
      relationships: {
        app: { data: { type: 'apps', id: APP } },
        territoryAvailabilities: { data: territories.map((t) => ({ type: 'territoryAvailabilities', id: `\${${t.id}}` })) },
      },
    },
    included: territories.map((t) => ({ type: 'territoryAvailabilities', id: `\${${t.id}}`, attributes: { available: true }, relationships: { territory: { data: { type: 'territories', id: t.id } } } })),
  })
  console.log(`available in ${territories.length} countries and regions`)
} else {
  console.log('availability: already set')
}

// 3. The newest processed build goes with version 1.0.
const app = await must('GET', `/v1/apps/${APP}?include=appStoreVersions`)
const version = app.included.find((x) => x.type === 'appStoreVersions')
const builds = (await must('GET', `/v1/builds?filter[app]=${APP}&filter[processingState]=VALID&sort=-uploadedDate&limit=1`)).data
if (!builds.length) throw new Error('no processed build to attach')
await must('PATCH', `/v1/appStoreVersions/${version.id}/relationships/build`, { data: { type: 'builds', id: builds[0].id } })
console.log(`version ${version.attributes.versionString}: build ${builds[0].attributes.version} attached; state ${version.attributes.appStoreState}`)
