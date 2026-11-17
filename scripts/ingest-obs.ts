// Refreshes public/data/observations.json: snow actually measured on the ground near each
// resort, to set beside what the models say. Each source is an adapter that returns stations with
// their latest readings; readings are quality-checked against their neighbours, and resorts are
// then matched to the nearest station at a comparable height.
//
// Sources (all official, free, and read without a key):
//   US      NOAA NOHRSC national station reports: snow depth and observer-measured snowfall
//           from the cooperative, CoCoRaHS, SNOTEL and mesonet networks.
//   Japan   JMA AMeDAS: snow depth and 24-hour snowfall, hourly.
//   Alps    SLF (Switzerland), GeoSphere Austria, and the avalanche services of Tirol, South
//           Tyrol and Trentino (avalanche.report).
//   Canada  British Columbia automated snow weather stations.
//
// Usage: node scripts/ingest-obs.ts [source ...]     (no arguments: every source)
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import type { Observation, ObservationsFile, ResortsFile } from '../src/lib/types.ts'

interface Reading {
  value: number
  /** When it was taken (ISO, UTC). */
  at: string
}
interface Station {
  source: string
  name: string
  lat: number
  lon: number
  elevation: number
  depthCm?: Reading
  /** New snow measured over 24 / 72 h (an observer's board, or a snowfall gauge). */
  new24Cm?: Reading
  new72Cm?: Reading
  /** Change in snow depth: new snow minus settling, so it understates a storm. */
  change24Cm?: Reading
  change72Cm?: Reading
}

const MAX_KM = 10
/** A station counts for a resort when it stands between a little below the base and a little above the summit. */
const BELOW_BASE_M = 200
const ABOVE_TOP_M = 300
/** Readings older than this are dropped: they no longer describe the mountain. */
const MAX_AGE_H = 72
const HOUR = 3_600_000
const now = Date.now()

async function get(url: string): Promise<Response> {
  const res = await fetch(url, { signal: AbortSignal.timeout(90_000), headers: { 'user-agent': 'powtracker (snow forecast site)' } })
  if (!res.ok) throw new Error(`${url.slice(0, 100)}: HTTP ${res.status}`)
  return res
}
const getJson = async <T>(url: string): Promise<T> => (await (await get(url)).json()) as T
const getText = async (url: string): Promise<string> => (await get(url)).text()
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s\-/(])([a-zà-ÿ])/g, (_, a: string, b: string) => a + b.toUpperCase())

// --- Switzerland ------------------------------------------------------------------------------
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
    if ((Date.parse(last.measure_date) - Date.parse(first.measure_date)) / HOUR >= 20) station.change24Cm = { value: Math.max(0, last.HS! - first.HS!), at: last.measure_date }
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

// --- Tirol, South Tyrol, Trentino ---------------------------------------------------------------
async function albina(): Promise<Station[]> {
  interface Feature {
    geometry: { coordinates: [number, number, number] }
    properties: { name: string; operator?: string; date?: string; HS?: number | null; HSD24?: number | null; HSD72?: number | null }
  }
  const { features } = await getJson<{ features: Feature[] }>('https://static.avalanche.report/weather_stations/stations.geojson')
  const out: Station[] = []
  for (const f of features) {
    const p = f.properties
    if (p.HS == null || !p.date) continue
    const at = new Date(p.date).toISOString()
    const [lon, lat, elevation] = f.geometry.coordinates
    const station: Station = { source: p.operator ? `${p.operator} (avalanche.report)` : 'avalanche.report', name: p.name, lat, lon, elevation, depthCm: { value: Math.max(0, p.HS), at } }
    if (p.HSD24 != null) station.change24Cm = { value: Math.max(0, p.HSD24), at }
    if (p.HSD72 != null) station.change72Cm = { value: Math.max(0, p.HSD72), at }
    out.push(station)
  }
  return out
}

// --- Austria ----------------------------------------------------------------------------------
async function geosphere(): Promise<Station[]> {
  const api = 'https://dataset.api.hub.geosphere.at/v1/station'
  interface Meta { stations: { id: string; name: string; lat: number; lon: number; altitude: number; is_active: boolean }[] }
  interface Data { timestamps: string[]; features: { properties: { station: string; parameters: { SCHNEE: { data: (number | null)[] } } } }[] }
  const meta = await getJson<Meta>(`${api}/current/tawes-v1-10min/metadata`)
  const active = meta.stations.filter((s) => s.is_active)
  const ids = active.map((s) => s.id).join(',')
  const current = await getJson<Data>(`${api}/current/tawes-v1-10min?parameters=SCHNEE&station_ids=${ids}`)
  // Stations report at different times, so the reply has one column per timestamp: take each
  // station's newest value and the time it belongs to.
  const newest = (d: Data) =>
    new Map(
      d.features.map((f) => {
        const data = f.properties.parameters.SCHNEE.data
        let i = data.length - 1
        while (i >= 0 && data[i] == null) i--
        return [f.properties.station, i < 0 ? null : { value: data[i]!, at: new Date(d.timestamps[i]).toISOString() }] as const
      }),
    )
  const nowDepth = newest(current)
  const latest = Date.parse(current.timestamps.at(-1)!)
  // The same reading 24 and 72 hours earlier gives the change in depth.
  const earlier = async (hours: number) => {
    const t = new Date(latest - hours * HOUR).toISOString().slice(0, 16)
    try {
      return newest(await getJson<Data>(`${api}/historical/tawes-v1-10min?parameters=SCHNEE&start=${t}&end=${t}&station_ids=${ids}`))
    } catch {
      return new Map<string, Reading | null>()
    }
  }
  const [d24, d72] = await Promise.all([earlier(24), earlier(72)])
  const out: Station[] = []
  for (const s of active) {
    const depth = nowDepth.get(s.id)
    if (!depth) continue
    const station: Station = { source: 'GeoSphere Austria', name: titleCase(s.name), lat: s.lat, lon: s.lon, elevation: s.altitude, depthCm: { value: Math.max(0, depth.value), at: depth.at } }
    // Changes only make sense against a reading taken at the latest time.
    if (Date.parse(depth.at) === latest) {
      const b24 = d24.get(s.id)
      const b72 = d72.get(s.id)
      if (b24) station.change24Cm = { value: Math.max(0, depth.value - b24.value), at: depth.at }
      if (b72) station.change72Cm = { value: Math.max(0, depth.value - b72.value), at: depth.at }
    }
    out.push(station)
  }
  return out
}

// --- Japan ------------------------------------------------------------------------------------
async function jma(): Promise<Station[]> {
  const base = 'https://www.jma.go.jp/bosai/amedas'
  // Snow is an hourly element: read the map for the top of the latest hour.
  const latest = (await getText(`${base}/data/latest_time.txt`)).trim()
  const hour = latest.slice(0, 13)
  const stamp = hour.replace(/[-T]/g, '') + '0000'
  const at = new Date(`${hour}:00:00+09:00`).toISOString()
  type Obs = Record<string, [number | null, number | null] | undefined>
  interface Site { lat: [number, number]; lon: [number, number]; alt: number; enName: string }
  const [map, table] = await Promise.all([getJson<Record<string, Obs>>(`${base}/data/map/${stamp}.json`), getJson<Record<string, Site>>(`${base}/const/amedastable.json`)])
  // A reading counts when its quality flag is 0 (normal).
  const ok = (v: [number | null, number | null] | undefined) => (v && v[0] != null && v[1] === 0 ? v[0] : null)
  const out: Station[] = []
  for (const [id, obs] of Object.entries(map)) {
    const site = table[id]
    const depth = ok(obs.snow)
    if (!site || depth == null) continue
    const station: Station = { source: 'JMA AMeDAS', name: site.enName, lat: site.lat[0] + site.lat[1] / 60, lon: site.lon[0] + site.lon[1] / 60, elevation: site.alt, depthCm: { value: depth, at } }
    const fall = ok(obs.snow24h)
    if (fall != null) station.new24Cm = { value: fall, at }
    out.push(station)
  }
  return out
}

// --- United States ----------------------------------------------------------------------------
async function nohrsc(): Promise<Station[]> {
  const root = 'https://www.nohrsc.noaa.gov/nsa/discussions_text/National'
  /** The newest metric report files of one kind: each holds the reports of a six-hour window. */
  const recent = async (kind: string, count: number): Promise<string[]> => {
    const urls: string[] = []
    for (const monthsBack of [0, 1]) {
      const d = new Date(now)
      d.setUTCDate(1)
      d.setUTCMonth(d.getUTCMonth() - monthsBack)
      const dir = `${root}/${kind}/${d.toISOString().slice(0, 7).replace('-', '')}/`
      const listing = await getText(dir).catch(() => '')
      const files = [...listing.matchAll(/href="([^"]+_m\.txt)"/g)].map((m) => m[1]).sort().reverse()
      urls.push(...files.map((f) => dir + f))
      if (urls.length >= count + 4) break
    }
    return urls.slice(0, count + 4)
  }
  const rows = async (kind: string, count: number): Promise<string[][]> => {
    const out: string[][] = []
    let used = 0
    for (const url of await recent(kind, count)) {
      const lines = (await getText(url)).split('\n').filter((l) => l && !l.startsWith('!') && !l.startsWith('Station_Id'))
      if (lines.length === 0) continue // a window that has not started yet
      out.push(...lines.map((l) => l.split('|')))
      if (++used >= count) break
    }
    return out
  }
  const when = (s: string) => new Date(`${s.replace(' ', 'T')}${s.length <= 13 ? ':00' : ''}:00Z`).toISOString()
  const stations = new Map<string, Station>()
  const station = (c: string[]): Station => {
    let s = stations.get(c[0])
    if (!s) {
      s = { source: 'NOAA station report', name: titleCase(c[1]), lat: Number(c[2]), lon: Number(c[3]), elevation: Number.parseFloat(c[4]) }
      stations.set(c[0], s)
    }
    return s
  }
  const newer = (old: Reading | undefined, at: string) => !old || at > old.at
  // Snow depth: the last 30 hours of reports, newest per station.
  for (const c of await rows('snowdepth', 5)) {
    const value = Number(c[7])
    if (c[8] !== 'cm' || !Number.isFinite(value)) continue
    const at = when(c[6])
    const s = station(c)
    if (newer(s.depthCm, at)) s.depthCm = { value, at }
  }
  // Snowfall reports say how long they cover: keep the 24- and 72-hour ones.
  for (const c of await rows('snowfall', 5)) {
    const value = Number(c[7])
    if (c[8] !== 'cm' || c[10] !== 'hours' || !Number.isFinite(value)) continue
    const at = when(c[6])
    const s = station(c)
    if (Number(c[9]) === 24 && newer(s.new24Cm, at)) s.new24Cm = { value, at }
    if (Number(c[9]) === 72 && newer(s.new72Cm, at)) s.new72Cm = { value, at }
  }
  return [...stations.values()].filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon) && Number.isFinite(s.elevation))
}

// --- British Columbia -------------------------------------------------------------------------
async function bc(): Promise<Station[]> {
  interface Feature { properties: { LOCATION_ID: string; LOCATION_NAME: string; ELEVATION: number; LATITUDE: number; LONGITUDE: number } }
  const wfs =
    'https://openmaps.gov.bc.ca/geo/pub/WHSE_WATER_MANAGEMENT.SSL_SNOW_ASWS_STNS_SP/ows?service=WFS&version=2.0.0&request=GetFeature' +
    '&typeName=pub:WHSE_WATER_MANAGEMENT.SSL_SNOW_ASWS_STNS_SP&outputFormat=json&srsName=EPSG:4326'
  const [sites, csv] = await Promise.all([getJson<{ features: Feature[] }>(wfs), getText('https://www.env.gov.bc.ca/wsd/data_searches/snow/asws/data/SD.csv')])
  const byId = new Map(sites.features.map((f) => [f.properties.LOCATION_ID, f.properties]))
  const lines = csv.trim().split('\n').map((l) => l.split(','))
  const head = lines[0]
  // Hourly rows, newest last: "2026-11-17 05:00" in UTC.
  const rowsByTime = new Map(lines.slice(1).map((r) => [Date.parse(`${r[0].replace(' ', 'T')}:00Z`), r]))
  const times = [...rowsByTime.keys()].sort((a, b) => a - b)
  const out: Station[] = []
  for (let col = 1; col < head.length; col++) {
    const site = byId.get(head[col].trim().split(' ')[0])
    if (!site) continue
    const valueAt = (t: number): number | null => {
      const cell = rowsByTime.get(t)?.[col]?.trim()
      return cell ? Number(cell) : null
    }
    // The newest reading of the last six hours, and the readings 24 and 72 hours before it.
    const t = times.slice(-6).reverse().find((time) => valueAt(time) != null)
    if (t == null) continue
    const depth = valueAt(t)!
    const at = new Date(t).toISOString()
    const station: Station = { source: 'BC snow weather station', name: site.LOCATION_NAME, lat: site.LATITUDE, lon: site.LONGITUDE, elevation: site.ELEVATION, depthCm: { value: Math.max(0, depth), at } }
    const b24 = valueAt(t - 24 * HOUR)
    const b72 = valueAt(t - 72 * HOUR)
    if (b24 != null) station.change24Cm = { value: Math.max(0, depth - b24), at }
    if (b72 != null) station.change72Cm = { value: Math.max(0, depth - b72), at }
    out.push(station)
  }
  return out
}

const ADAPTERS: { id: string; credit: string; run: () => Promise<Station[]> }[] = [
  { id: 'nohrsc', credit: 'NOAA National Operational Hydrologic Remote Sensing Center (US)', run: nohrsc },
  { id: 'jma', credit: 'Japan Meteorological Agency, AMeDAS', run: jma },
  { id: 'slf', credit: 'WSL Institute for Snow and Avalanche Research SLF (Switzerland)', run: slf },
  { id: 'geosphere', credit: 'GeoSphere Austria', run: geosphere },
  { id: 'albina', credit: 'Avalanche services of Tirol, South Tyrol and Trentino (avalanche.report)', run: albina },
  { id: 'bc', credit: 'Government of British Columbia, automated snow weather stations', run: bc },
]

function km(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(a))
}
const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

/**
 * Quality control. Automated depth sensors fail in recognisable ways (a 6 m reading in November),
 * so a deep reading has to be believable next to its neighbours: stations within 50 km and 500 m
 * of height. A station whose depth is far above theirs, or deep with nobody near to vouch for
 * it, is dropped whole, since its changes are computed from the same sensor.
 */
function qualityCheck(stations: Station[]): { kept: Station[]; dropped: string[] } {
  const fresh = (r: Reading | undefined) => (r && now - Date.parse(r.at) <= MAX_AGE_H * HOUR && now - Date.parse(r.at) > -6 * HOUR ? r : undefined)
  const sane = (r: Reading | undefined, max: number) => (r && r.value >= 0 && r.value <= max ? r : undefined)
  const cleaned = stations.map((s) => ({
    ...s,
    depthCm: sane(fresh(s.depthCm), 800),
    new24Cm: sane(fresh(s.new24Cm), 200),
    new72Cm: sane(fresh(s.new72Cm), 400),
    change24Cm: sane(fresh(s.change24Cm), 200),
    change72Cm: sane(fresh(s.change72Cm), 400),
  }))
  const withDepth = cleaned.filter((s) => s.depthCm)
  const dropped: string[] = []
  const kept = cleaned.filter((s) => {
    const depth = s.depthCm?.value
    if (depth == null || depth < 100) return true
    const near = withDepth.filter((o) => o !== s && Math.abs(o.elevation - s.elevation) <= 500 && km(s.lat, s.lon, o.lat, o.lon) <= 50).map((o) => o.depthCm!.value)
    const bad = near.length >= 2 ? depth > 3 * median(near) + 50 : depth > 250
    if (bad) dropped.push(`${s.name} (${Math.round(depth)} cm; ${near.length >= 2 ? `neighbours' median ${Math.round(median(near))} cm` : 'no neighbours to confirm it'})`)
    return !bad
  })
  return { kept: kept.filter((s) => s.depthCm || s.new24Cm || s.new72Cm || s.change24Cm || s.change72Cm), dropped }
}

const only = process.argv.slice(2)
const resorts = (JSON.parse(readFileSync('public/data/resorts.json', 'utf8')) as ResortsFile).resorts
const stations: Station[] = []
const sources: string[] = []
for (const adapter of ADAPTERS) {
  if (only.length && !only.includes(adapter.id)) continue
  try {
    const got = await adapter.run()
    stations.push(...got)
    sources.push(adapter.credit)
    console.log(`${adapter.id}: ${got.length} stations (${got.filter((s) => s.depthCm).length} with depth, ${got.filter((s) => s.new24Cm).length} with measured 24 h snowfall)`)
  } catch (e) {
    // One source being down must not cost the readings from the others.
    console.warn(`${adapter.id}: failed (${String(e).slice(0, 160)}); skipping`)
  }
}
if (stations.length === 0) throw new Error('no observation source returned data; keeping the previous observations.json')

const { kept, dropped } = qualityCheck(stations)
console.log(`quality check: kept ${kept.length} of ${stations.length} stations; dropped ${dropped.length} implausible depths`)
for (const d of dropped.slice(0, 12)) console.log(`  dropped ${d}`)

const out: ObservationsFile = { generated: new Date(now).toISOString(), sources, resorts: {} }
const KINDS = [['depth', 'depthCm'], ['new24', 'new24Cm'], ['change24', 'change24Cm'], ['new72', 'new72Cm'], ['change72', 'change72Cm']] as const
for (const r of resorts) {
  const near = kept
    .map((s) => ({ s, d: km(r.la, r.lo, s.lat, s.lon) }))
    .filter(({ s, d }) => d <= MAX_KM && s.elevation >= r.b - BELOW_BASE_M && s.elevation <= r.t + ABOVE_TOP_M)
    .sort((a, b) => a.d - b.d)
  const obs: Observation[] = []
  for (const [kind, field] of KINDS) {
    // The nearest station that has this kind of reading.
    const hit = near.find(({ s }) => s[field] != null)
    if (!hit) continue
    // A measured new-snow figure makes the depth-change stand-in for the same period unnecessary.
    if (kind === 'change24' && obs.some((o) => o.k === 'new24')) continue
    if (kind === 'change72' && obs.some((o) => o.k === 'new72')) continue
    const reading = hit.s[field]!
    obs.push({ k: kind, v: Math.round(reading.value), at: reading.at, st: hit.s.name, z: Math.round(hit.s.elevation), km: Math.round(hit.d * 10) / 10, src: hit.s.source })
  }
  if (obs.length) out.resorts[r.id] = obs
}

const file = 'public/data/observations.json'
// Naming sources is for trying one adapter: the file is only replaced by a full run.
if (only.length === 0) {
  writeFileSync(`${file}.tmp`, JSON.stringify(out))
  renameSync(`${file}.tmp`, file)
}
const count = (k: Observation['k']) => Object.values(out.resorts).filter((o) => o.some((x) => x.k === k)).length
console.log(
  `${only.length ? 'partial run, nothing written' : `wrote ${file}`}: measurements for ${Object.keys(out.resorts).length} of ${resorts.length} resorts ` +
    `(${count('depth')} with snow depth, ${count('new24')} with measured 24 h snowfall, ${count('change24')} with a 24 h depth change)`,
)
