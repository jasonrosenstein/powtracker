// Sets up TestFlight for the team: an internal group that gets every build, with the account's
// own people as testers. Each tester is emailed an invitation by Apple. Safe to run again.
// Usage: node scripts/asc-testflight.mjs
import { readFileSync } from 'node:fs'
import { asc } from './asc.mjs'

const APP = JSON.parse(readFileSync('ios/store/listing.json', 'utf8')).appId
async function must(method, path, body) {
  const res = await asc(method, path, body)
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${JSON.stringify(res.json?.errors?.map((e) => e.detail) ?? res.text.slice(0, 300))}`)
  return res.json
}

const groups = (await must('GET', `/v1/apps/${APP}/betaGroups?limit=50`)).data
let group = groups.find((g) => g.attributes.isInternalGroup)
if (!group) {
  group = (await must('POST', '/v1/betaGroups', {
    data: { type: 'betaGroups', attributes: { name: 'Team', isInternalGroup: true, hasAccessToAllBuilds: true }, relationships: { app: { data: { type: 'apps', id: APP } } } },
  })).data
  console.log('created the internal TestFlight group "Team"')
}

const users = (await must('GET', '/v1/users?limit=50')).data
const testers = (await must('GET', `/v1/betaGroups/${group.id}/betaTesters?limit=100`)).data
const have = new Set(testers.map((t) => (t.attributes.email ?? '').toLowerCase()))
for (const user of users) {
  const email = user.attributes.username
  if (have.has(email.toLowerCase())) continue
  await must('POST', '/v1/betaTesters', {
    data: {
      type: 'betaTesters',
      attributes: { email, firstName: user.attributes.firstName, lastName: user.attributes.lastName },
      relationships: { betaGroups: { data: [{ type: 'betaGroups', id: group.id }] } },
    },
  })
  console.log(`added ${user.attributes.firstName} (${user.attributes.roles.join(', ')}) as a tester`)
}

const builds = (await must('GET', `/v1/builds?filter[app]=${APP}&limit=5`)).data
console.log(builds.length ? builds.map((b) => `build ${b.attributes.version}: ${b.attributes.processingState}`).join('; ') : 'no build has finished processing yet')
