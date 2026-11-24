// Waits for Apple to finish processing a build, then says whether TestFlight can offer it.
// Usage: node scripts/asc-wait-build.mjs <build-number> [minutes]
import { readFileSync } from 'node:fs'
import { asc } from './asc.mjs'

const APP = JSON.parse(readFileSync('ios/store/listing.json', 'utf8')).appId
const want = process.argv[2]
const deadline = Date.now() + Number(process.argv[3] ?? 9) * 60_000
for (;;) {
  const builds = (await asc('GET', `/v1/builds?filter[app]=${APP}&filter[version]=${want}&limit=1`)).json
  const build = builds?.data?.[0]
  if (build && build.attributes.processingState !== 'PROCESSING') {
    console.log(`build ${build.attributes.version}: ${build.attributes.processingState}`)
    process.exit(build.attributes.processingState === 'VALID' ? 0 : 1)
  }
  if (Date.now() >= deadline) {
    console.log(`build ${want} is still processing at Apple`)
    process.exit(2)
  }
  await new Promise((r) => setTimeout(r, 45_000))
}
