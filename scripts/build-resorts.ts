// Builds public/data/resorts.json: the tracker's resort list, from the OpenSkiMap ski-area
// dataset and the curated pass rosters in data/passes/*.json.
//
// A ski area is tracked when it has at least MIN_VERT metres of vertical and a mapped lift, or
// when a pass covers it (pass holders want their small local hill too).
//
// Usage: node scripts/build-resorts.ts
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { regionOf } from '../src/lib/regions.ts'
import type { PassDef, Resort, ResortsFile } from '../src/lib/types.ts'
import { loadSkiAreas, SKIAREAS_FILE, SKIAREAS_URL } from './lib/openskimap.ts'

const MIN_VERT = 300
const PASS_DIR = 'data/passes'
/** Display order of the pass filters; rosters not listed here follow alphabetically. */
const PASS_ORDER = ['ikon', 'epic', 'indy', 'mountain-collective', 'power', 'magic']

interface PassFile {
  pass: string
  label: string
  season: string
  destinations: { name: string; kind?: 'unlimited' | 'limited' | 'discount' | 'unknown'; confirmed?: boolean; ids: string[] }[]
}

/** Hand corrections to OpenSkiMap, keyed by its ski-area id. See data/overrides.json. */
type Overrides = Record<string, { base?: number; top?: number; name?: string; note: string }>

if (!existsSync(SKIAREAS_FILE)) {
  throw new Error(`${SKIAREAS_FILE} is missing: run "npm run data:skiareas" to download it from ${SKIAREAS_URL}`)
}
const areas = loadSkiAreas()
const byOsmId = new Map(areas.map((a) => [a.osmId, a]))

// OpenSkiMap derives elevations from the runs and lifts mapped in OpenStreetMap, so a mountain
// that is mostly unmapped off-piste comes out too small. Overrides put the real figures back.
const overrides = existsSync('data/overrides.json') ? (JSON.parse(readFileSync('data/overrides.json', 'utf8')) as Overrides) : {}
for (const [id, o] of Object.entries(overrides)) {
  const a = byOsmId.get(id)
  if (!a) throw new Error(`data/overrides.json: ${id} is not a ski area in OpenSkiMap (${o.note})`)
  if (o.name) a.name = o.name
  if (o.base != null) a.base = o.base
  if (o.top != null) a.top = o.top
  a.vert = a.top - a.base
}

// Pass membership: a destination counts when the roster confirmed it for the season and the pass
// includes days there. Discount-only partners are not "on the pass".
const passes: PassDef[] = []
const passesOf = new Map<string, string[]>()
const files = existsSync(PASS_DIR) ? readdirSync(PASS_DIR).filter((f) => f.endsWith('.json')) : []
const rosters = files.map((f) => JSON.parse(readFileSync(`${PASS_DIR}/${f}`, 'utf8')) as PassFile)
rosters.sort((a, b) => {
  const ia = PASS_ORDER.indexOf(a.pass)
  const ib = PASS_ORDER.indexOf(b.pass)
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.pass.localeCompare(b.pass)
})
for (const roster of rosters) {
  let covered = 0
  let skipped = 0
  const unknown: string[] = []
  for (const dest of roster.destinations) {
    if (dest.confirmed === false || dest.kind === 'discount') {
      skipped++
      continue
    }
    for (const id of dest.ids) {
      if (!byOsmId.has(id)) {
        unknown.push(`${dest.name} (${id.slice(0, 8)})`)
        continue
      }
      const list = passesOf.get(id) ?? []
      if (!list.includes(roster.pass)) {
        list.push(roster.pass)
        covered++
      }
      passesOf.set(id, list)
    }
  }
  passes.push({ slug: roster.pass, label: roster.label, season: roster.season })
  const unmatched = roster.destinations.filter((d) => d.ids.length === 0).length
  console.log(
    `${roster.label}: ${roster.destinations.length} destinations -> ${covered} ski areas` +
      ` (${skipped} unconfirmed or discount-only, ${unmatched} with no OpenSkiMap match)`,
  )
  if (unknown.length) throw new Error(`${roster.pass}: ids not in OpenSkiMap: ${unknown.join(', ')}`)
}

// An area with no lift mapped is usually not a lift-served resort at all (a touring zone, a
// housing estate with ski-in trails, an unfinished project), so it needs a pass to vouch for it.
const picked = areas.filter((a) => passesOf.has(a.osmId) || (a.vert >= MIN_VERT && a.lifts > 0))

// Short ids: the shortest prefix of the OpenSkiMap id that is unique across the tracked set.
let idLen = 8
while (new Set(picked.map((a) => a.osmId.slice(0, idLen))).size !== picked.length) idLen++

const unknownCountries = new Set<string>()
const resorts: Resort[] = picked
  .map((a) => {
    if (a.cc && !regionOf(a.cc)) unknownCountries.add(`${a.cc} (${a.country})`)
    const r: Resort = {
      id: a.osmId.slice(0, idLen),
      n: a.name,
      cc: a.cc,
      co: a.country,
      rg: a.region,
      la: Math.round(a.lat * 1e4) / 1e4,
      lo: Math.round(a.lon * 1e4) / 1e4,
      b: a.base,
      t: a.top,
      km: Math.round(a.runKm),
      li: a.lifts,
      p: passesOf.get(a.osmId) ?? [],
    }
    if (a.website) r.w = a.website
    return r
  })
  .sort((x, y) => y.t - y.b - (x.t - x.b))

if (unknownCountries.size) {
  throw new Error(`countries missing from src/lib/regions.ts: ${[...unknownCountries].join(', ')}`)
}

const file: ResortsFile = {
  generated: new Date().toISOString(),
  source: 'Ski areas and elevations: OpenSkiMap.org, OpenStreetMap contributors (ODbL).',
  passes,
  resorts,
}
mkdirSync('public/data', { recursive: true })
writeFileSync('public/data/resorts.json', JSON.stringify(file))
console.log(
  `wrote public/data/resorts.json: ${resorts.length} resorts ` +
    `(${picked.filter((a) => a.vert >= MIN_VERT).length} with ${MIN_VERT} m+ vertical, ` +
    `${picked.filter((a) => a.vert < MIN_VERT).length} smaller ones on a pass, ` +
    `${areas.filter((a) => a.vert >= MIN_VERT && a.lifts === 0 && !passesOf.has(a.osmId)).length} left out for having no lift, ` +
    `${resorts.filter((r) => !r.cc).length} with no country)`,
)
