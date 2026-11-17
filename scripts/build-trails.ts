// Builds public/data/trails/<id>.json: every tracked mountain's runs and lifts, for its trail map.
// Reads OpenSkiMap's runs and lifts datasets (OpenStreetMap, ODbL), one feature per line, and
// keeps the downhill runs and operating lifts that belong to a tracked ski area.
//
// The inputs are large (about 1 GB on disk): "npm run data:trailsource" downloads them into
// data/raw/openskimap/. The output is not committed; the publish job builds it.
//
// Usage: node scripts/build-trails.ts
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { DIFFICULTIES, encodeLine, lineLength, simplify, type LonLat } from '../src/lib/trails.ts'
import { RUN_FLAGS, type ResortsFile, type TrailsFile } from '../src/lib/types.ts'

const RAW = 'data/raw/openskimap'
const OUT = 'public/data/trails'
type Point = [number, number, number?]

interface Feature {
  geometry: { type: string; coordinates: unknown } | null
  properties: {
    name?: string | null
    ref?: string | null
    uses?: string[]
    status?: string | null
    difficulty?: string | null
    grooming?: string | null
    lit?: boolean | null
    gladed?: boolean | null
    liftType?: string | null
    skiAreas?: { properties: { id: string } }[]
  }
}

for (const f of ['runs.geojson', 'lifts.geojson']) {
  if (!existsSync(`${RAW}/${f}`)) throw new Error(`${RAW}/${f} is missing: run "npm run data:trailsource" first`)
}
const resorts = (JSON.parse(readFileSync('public/data/resorts.json', 'utf8')) as ResortsFile).resorts
const idLen = resorts[0].id.length
const tracked = new Map<string, TrailsFile>(resorts.map((r) => [r.id, { r: [], l: [] }]))

/** Each feature of a line-delimited GeoJSON file. */
async function* features(file: string): AsyncGenerator<Feature> {
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity })
  for await (const raw of lines) {
    const line = raw.endsWith(',') ? raw.slice(0, -1) : raw
    if (!line.startsWith('{"type":"Feature"')) continue
    yield JSON.parse(line) as Feature
  }
}
const owners = (f: Feature): TrailsFile[] =>
  (f.properties.skiAreas ?? []).map((a) => tracked.get(a.properties.id.slice(0, idLen))).filter((t): t is TrailsFile => t != null)
const heights = (pts: Point[]) => pts.map((p) => p[2]).filter((z): z is number => typeof z === 'number')
const drop = (pts: Point[]) => {
  const z = heights(pts)
  return z.length ? Math.round(Math.max(...z) - Math.min(...z)) : 0
}
const flat = (pts: Point[]): LonLat[] => simplify(pts).map((p) => [p[0], p[1]])

let runs = 0
for await (const f of features(`${RAW}/runs.geojson`)) {
  const p = f.properties
  if (!f.geometry || !(p.uses ?? []).includes('downhill') || (p.status && p.status !== 'operating')) continue
  const to = owners(f)
  if (to.length === 0) continue
  // A run is a line down the slope, or an outline around an open area such as a bowl.
  const area = f.geometry.type === 'Polygon'
  const pts = (area ? (f.geometry.coordinates as Point[][])[0] : f.geometry.type === 'LineString' ? (f.geometry.coordinates as Point[]) : null) ?? null
  if (!pts || pts.length < 2) continue
  const line = flat(pts)
  const difficulty = Math.max(0, DIFFICULTIES.indexOf((p.difficulty ?? 'other') as (typeof DIFFICULTIES)[number]))
  const groomed = p.grooming != null && /classic|skating/.test(p.grooming)
  const flags =
    (groomed ? RUN_FLAGS.groomed : 0) | (p.lit ? RUN_FLAGS.lit : 0) | (p.gladed ? RUN_FLAGS.gladed : 0) | (p.grooming === 'mogul' || p.grooming === 'backcountry' ? RUN_FLAGS.ungroomed : 0)
  const entry: TrailsFile['r'][number] = [(p.name ?? '').trim(), difficulty < 0 ? 7 : difficulty, flags, Math.round(lineLength(line)), drop(pts), encodeLine(line), area ? 1 : 0, (p.ref ?? '').trim()]
  for (const t of to) t.r.push(entry)
  runs++
}

let lifts = 0
for await (const f of features(`${RAW}/lifts.geojson`)) {
  const p = f.properties
  if (!f.geometry || f.geometry.type !== 'LineString' || (p.status && p.status !== 'operating')) continue
  const to = owners(f)
  if (to.length === 0) continue
  const pts = f.geometry.coordinates as Point[]
  const line = flat(pts)
  const entry: TrailsFile['l'][number] = [(p.name ?? p.ref ?? '').trim(), p.liftType ?? 'lift', Math.round(lineLength(line)), drop(pts), encodeLine(line)]
  for (const t of to) t.l.push(entry)
  lifts++
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
let bytes = 0
let empty = 0
let largest = { name: '', kb: 0 }
for (const r of resorts) {
  const t = tracked.get(r.id)!
  if (t.r.length === 0 && t.l.length === 0) {
    empty++
    continue
  }
  // Longest first within the file, so the main runs and lifts are drawn and listed first.
  t.r.sort((a, b) => b[3] - a[3])
  t.l.sort((a, b) => b[2] - a[2])
  const json = JSON.stringify(t)
  writeFileSync(`${OUT}/${r.id}.json`, json)
  bytes += json.length
  if (json.length / 1024 > largest.kb) largest = { name: r.n, kb: Math.round(json.length / 1024) }
}
console.log(
  `wrote ${OUT}/: ${resorts.length - empty} mountains (${empty} with nothing mapped), ${runs} runs, ${lifts} lifts, ` +
    `${(bytes / 1e6).toFixed(1)} MB in all; largest ${largest.name} at ${largest.kb} KB`,
)
