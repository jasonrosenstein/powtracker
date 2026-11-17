// Probe: how many of a mountain's mapped runs and lifts the resort's live feed can be matched to.
// Usage: node scripts/probe/match-rate.ts <resort id prefix> ...
import { readFileSync } from 'node:fs'
import { fetchLiveStatus, liveFeedFor } from '../../src/lib/status.ts'
import { decodeTrails, liftKey, nameKey } from '../../src/lib/trails.ts'
import type { ResortsFile, TrailsFile } from '../../src/lib/types.ts'

const resorts = (JSON.parse(readFileSync('public/data/resorts.json', 'utf8')) as ResortsFile).resorts
for (const prefix of process.argv.slice(2)) {
  const r = resorts.find((x) => x.id.startsWith(prefix))
  const feed = r && liveFeedFor(r)
  if (!r || !feed) {
    console.log(prefix, 'no mountain or no feed')
    continue
  }
  const map = decodeTrails(JSON.parse(readFileSync(`public/data/trails/${r.id}.json`, 'utf8')) as TrailsFile, r)
  const status = await fetchLiveStatus(feed)
  const numbers = new Set(status.trails.map((t) => t.number).filter(Boolean))
  const names = new Set(status.trails.map((t) => nameKey(t.name)).filter(Boolean))
  const liftNames = new Set(status.lifts.map((l) => liftKey(l.name)))
  const ident = map.runs.filter((run) => run.name || run.ref)
  const byNumber = ident.filter((run) => run.ref && numbers.has(run.ref)).length
  const byName = ident.filter((run) => !(run.ref && numbers.has(run.ref)) && run.name && names.has(nameKey(run.name))).length
  const lifts = map.lifts.filter((l) => l.name)
  const liftHit = lifts.filter((l) => liftNames.has(liftKey(l.name))).length
  console.log(
    `${r.n.slice(0, 34).padEnd(34)} runs ${byNumber + byName}/${ident.length} matched (${byNumber} by number, ${byName} by name; ${map.runs.length - ident.length} unnamed) | lifts ${liftHit}/${lifts.length} | feed: ${status.lifts.length} lifts, ${status.trails.length} trails, ${status.operating}`,
  )
  const missed = lifts.filter((l) => !liftNames.has(liftKey(l.name))).slice(0, 4).map((l) => l.name)
  if (missed.length) console.log(`   unmatched lifts e.g. ${missed.join(' | ')}   vs feed e.g. ${status.lifts.slice(0, 4).map((l) => l.name).join(' | ')}`)
}
