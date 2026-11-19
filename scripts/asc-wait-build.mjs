// Waits for Apple to finish processing the newest uploaded build, then says whether TestFlight
// can offer it. Usage: node scripts/asc-wait-build.mjs [minutes]
import { readFileSync } from 'node:fs'
import { asc } from './asc.mjs'

const APP = JSON.parse(readFileSync('ios/store/listing.json', 'utf8')).appId
const deadline = Date.now() + Number(process.argv[2] ?? 9) * 60_000
for (;;) {
  const builds = (await asc('GET', `/v1/builds?filter[app]=${APP}&sort=-uploadedDate&limit=1&include=buildBetaDetail`)).json
  const build = builds?.data?.[0]
  const beta = builds?.included?.find((x) => x.type === 'buildBetaDetails')
  if (build && build.attributes.processingState !== 'PROCESSING') {
    console.log(`build ${build.attributes.version}: ${build.attributes.processingState}; TestFlight for the team: ${beta?.attributes.internalBuildState ?? 'unknown'}`)
    process.exit(build.attributes.processingState === 'VALID' ? 0 : 1)
  }
  if (Date.now() >= deadline) {
    const upload = (await asc('GET', `/v1/apps/${APP}/buildUploads?limit=1`)).json?.data?.[0]
    console.log(`still processing at Apple (upload state: ${upload?.attributes.state.state ?? 'unknown'}, errors: ${upload?.attributes.state.errors.length ?? '?'})`)
    process.exit(2)
  }
  await new Promise((r) => setTimeout(r, 45_000))
}
