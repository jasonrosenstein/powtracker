// Refreshes public/data/observations.json: snow actually measured on the ground near each
// resort, to set beside what the models say. Each source is an adapter that returns stations with
// their latest readings; resorts are then matched to the nearest station at a comparable height.
//
// Sources so far:
//   SLF (WSL Institute for Snow and Avalanche Research, Switzerland): IMIS automatic stations
//   (snow depth every 30 minutes) and observer study plots (new snow measured each morning).
//
// Usage: node scripts/ingest-obs.ts
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import type { Observation, ObservationsFile, ResortsFile } from '../src/lib/types.ts'

interface Station {
  source: string
  name: string
  lat: number
  lon: number
  elevation: number
  /** Readings, each stamped with when it was taken (ISO, UTC). */
  depthCm?: { value: number; at: string }
  new24Cm?: { value: number; at: string }
  /** Change in snow depth over the last 24 h: new snow minus settling, so it understates a storm. */
  change24Cm?: { value: number; at: string }
}

const MAX_KM = 10
/** A station counts for a resort when it stands between a little below the base and a little above the summit. */
const BELOW_BASE_M = 200
const ABOVE_TOP_M = 300

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return (await res.json()) as T
}

async function slf(): Promise<Station[]> {
  const base = 'https://measurement-api.slf.ch/public/api'
  interface Meta { code: string; label: string; lat: number; lon: number; elevation: number; type?: string }
  interface Imis { station_code: string; measure_date: string; HS: number | null }
  interface Plot { station_code: string; measure_date: string; HS: number | null; HN_1D: number | null }
  const [imisStations, imis, plotStations, plots] = await Promise.all([
    getJson<Meta[]>(`${base}/imis/stations`),
    getJson<Imis[]>(`${base}/imis/measurements`),
    getJson<Meta[]>(`${base}/study-plot/stations`),
    getJson<Plot[]>(`${base}/study-plot/measurements`),
  ])
  const out: Station[] = []

  // Automatic stations: the feed holds the last 24 hours, so first-to-last reading is the 24 h change.
  const series = Map.groupBy(imis.filter((m) => m.HS != null), (m) => m.station_code)
  for (const meta of imisStations) {
    // Only stations on flat ground measure a depth that speaks for the slopes around them.
    if (meta.type !== 'SNOW_FLAT') continue
    const readings = (series.get(meta.code) ?? []).sort((a, b) => a.measure_date.localeCompare(b.measure_date))
    const first = readings[0]
    const last = readings.at(-1)
    if (!first || !last) continue
    const station: Station = { source: 'SLF automatic station', name: meta.label, lat: meta.lat, lon: meta.lon, elevation: meta.elevation, depthCm: { value: last.HS!, at: last.measure_date } }
    const spanH = (Date.parse(last.measure_date) - Date.parse(first.measure_date)) / 3_600_000
    if (spanH >= 20) station.change24Cm = { value: Math.max(0, last.HS! - first.HS!), at: last.measure_date }
    out.push(station)
  }

  // Observer plots: one reading each morning, with new snow measured on a board.
  const latest = new Map<string, Plot>()
  for (const p of plots) {
    const seen = latest.get(p.station_code)
    if (!seen || p.measure_date > seen.measure_date) latest.set(p.station_code, p)
  }
  for (const meta of plotStations) {
    const p = latest.get(meta.code)
    if (!p || (p.HS == null && p.HN_1D == null)) continue
    const station: Station = { source: 'SLF observer', name: meta.label, lat: meta.lat, lon: meta.lon, elevation: meta.elevation }
    if (p.HS != null) station.depthCm = { value: p.HS, at: p.measure_date }
    if (p.HN_1D != null) station.new24Cm = { value: p.HN_1D, at: p.measure_date }
    out.push(station)
  }
  return out
}

const ADAPTERS: { name: string; credit: string; run: () => Promise<Station[]> }[] = [
  { name: 'SLF', credit: 'WSL Institute for Snow and Avalanche Research SLF (Switzerland)', run: slf },
]

function km(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(a))
}

const resorts = (JSON.parse(readFileSync('public/data/resorts.json', 'utf8')) as ResortsFile).resorts
const stations: Station[] = []
const sources: string[] = []
for (const adapter of ADAPTERS) {
  try {
    const got = await adapter.run()
    stations.push(...got)
    sources.push(adapter.credit)
    console.log(`${adapter.name}: ${got.length} stations reporting`)
  } catch (e) {
    // One source being down must not cost the readings from the others.
    console.warn(`${adapter.name}: failed (${String(e).slice(0, 160)}); skipping`)
  }
}
if (stations.length === 0) throw new Error('no observation source returned data; keeping the previous observations.json')

const out: ObservationsFile = { generated: new Date().toISOString(), sources, resorts: {} }
const KINDS = [['depth', 'depthCm'], ['new24', 'new24Cm'], ['change24', 'change24Cm']] as const
for (const r of resorts) {
  const near = stations
    .map((s) => ({ s, d: km(r.la, r.lo, s.lat, s.lon) }))
    .filter(({ s, d }) => d <= MAX_KM && s.elevation >= r.b - BELOW_BASE_M && s.elevation <= r.t + ABOVE_TOP_M)
    .sort((a, b) => a.d - b.d)
  const obs: Observation[] = []
  for (const [kind, field] of KINDS) {
    // The nearest station that has this kind of reading.
    const hit = near.find(({ s }) => s[field] != null)
    if (!hit) continue
    // A measured new-snow figure makes the depth-change stand-in unnecessary.
    if (kind === 'change24' && obs.some((o) => o.k === 'new24')) continue
    const reading = hit.s[field]!
    obs.push({ k: kind, v: Math.round(reading.value), at: reading.at, st: hit.s.name, z: hit.s.elevation, km: Math.round(hit.d * 10) / 10, src: hit.s.source })
  }
  if (obs.length) out.resorts[r.id] = obs
}

const file = 'public/data/observations.json'
writeFileSync(`${file}.tmp`, JSON.stringify(out))
renameSync(`${file}.tmp`, file)
console.log(`wrote ${file}: measurements for ${Object.keys(out.resorts).length} of ${resorts.length} resorts from ${stations.length} stations`)
