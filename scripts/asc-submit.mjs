// Sends version 1.0 to App Review. Before submitting it declares that the app shows third-party
// content it has the rights to show (open weather, map and ski-area data, with credit), and
// sets the version to be released by hand once approved, not automatically.
// Usage: node scripts/asc-submit.mjs            prepare and report, without submitting
//        node scripts/asc-submit.mjs --submit   prepare and submit
import { readFileSync } from 'node:fs'
import { asc } from './asc.mjs'

const APP = JSON.parse(readFileSync('ios/store/listing.json', 'utf8')).appId
const submit = process.argv.includes('--submit')
async function must(method, path, body) {
  const res = await asc(method, path, body)
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${JSON.stringify(res.json?.errors?.map((e) => `${e.code}: ${e.detail}`) ?? res.text.slice(0, 400))}`)
  return res.json
}

await must('PATCH', `/v1/apps/${APP}`, { data: { type: 'apps', id: APP, attributes: { contentRightsDeclaration: 'USES_THIRD_PARTY_CONTENT' } } })
const app = await must('GET', `/v1/apps/${APP}?include=appStoreVersions`)
const version = app.included.find((x) => x.type === 'appStoreVersions')
await must('PATCH', `/v1/appStoreVersions/${version.id}`, { data: { type: 'appStoreVersions', id: version.id, attributes: { releaseType: 'MANUAL' } } })
console.log(`version ${version.attributes.versionString} (${version.attributes.appStoreState}): content rights declared, release by hand after approval`)

// One open submission per app: reuse it if a previous run made one.
const open = (await must('GET', `/v1/reviewSubmissions?filter[app]=${APP}&filter[state]=READY_FOR_REVIEW,UNRESOLVED_ISSUES&limit=5`)).data
let submission = open[0]
if (!submission) {
  submission = (await must('POST', '/v1/reviewSubmissions', { data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' }, relationships: { app: { data: { type: 'apps', id: APP } } } } })).data
  console.log('created a review submission')
}
const items = (await must('GET', `/v1/reviewSubmissions/${submission.id}/items?limit=20`)).data
if (items.length === 0) {
  await must('POST', '/v1/reviewSubmissionItems', {
    data: {
      type: 'reviewSubmissionItems',
      relationships: { reviewSubmission: { data: { type: 'reviewSubmissions', id: submission.id } }, appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } },
    },
  })
  console.log('added version 1.0 to the submission')
}

if (!submit) {
  console.log(`ready: submission ${submission.id} holds the version. Run again with --submit to send it.`)
} else {
  const sent = await must('PATCH', `/v1/reviewSubmissions/${submission.id}`, { data: { type: 'reviewSubmissions', id: submission.id, attributes: { submitted: true } } })
  console.log(`submitted: ${sent.data.attributes.state} at ${sent.data.attributes.submittedDate ?? 'now'}`)
}
