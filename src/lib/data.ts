// Loads the resort list and the forecast snapshot, and joins them into the rows the app sorts,
// filters and maps.
import { type Level } from './models.ts'
import { regionOf, type Region } from './regions.ts'
import { modelSpread } from './snow.ts'
import type { ForecastFile, Observation, ObservationsFile, Opening, OpeningsFile, PassDef, Resort, ResortForecast, ResortsFile } from './types.ts'

export interface Row {
  r: Resort
  /** Undefined when the latest snapshot has no forecast for this resort. */
  f: ResortForecast | undefined
  /** Readings from snow stations near the resort; undefined where no source covers it. */
  o: Observation[] | undefined
  /** The announced opening of its season; undefined where none was found. */
  op: Opening | undefined
  vert: number
  region: Region | null
  /** Lower-cased text the search box matches against. */
  search: string
}

export interface Dataset {
  rows: Row[]
  passes: PassDef[]
  /** When the forecast snapshot was taken. */
  generated: Date
  models: string[]
  source: string
  /** When the station measurements were gathered; null when there are none. */
  measuredAt: Date | null
}

export async function loadDataset(): Promise<Dataset> {
  const get = async <T>(file: string): Promise<T> => {
    // Skip the HTTP cache: the snapshot is replaced in place twice a day.
    const res = await fetch(`${import.meta.env.BASE_URL}data/${file}`, { cache: 'no-cache' })
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`)
    return (await res.json()) as T
  }
  // Measurements are a bonus: the tracker still works when that file is missing.
  const noObs: ObservationsFile = { generated: '', sources: [], resorts: {} }
  const noOpenings: OpeningsFile = { season: '', compiled: '', resorts: {} }
  const [resorts, forecast, obs, openings] = await Promise.all([
    get<ResortsFile>('resorts.json'),
    get<ForecastFile>('forecast.json'),
    get<ObservationsFile>('observations.json').catch(() => noObs),
    get<OpeningsFile>('openings.json').catch(() => noOpenings),
  ])
  const rows: Row[] = resorts.resorts.map((r) => ({
    r,
    f: forecast.resorts[r.id],
    o: obs.resorts[r.id],
    op: openings.resorts[r.id],
    vert: r.t - r.b,
    region: regionOf(r.cc),
    search: `${r.n} ${r.rg} ${r.co}`.toLowerCase(),
  }))
  return { rows, passes: resorts.passes, generated: new Date(forecast.generated), models: forecast.models, source: resorts.source, measuredAt: obs.generated ? new Date(obs.generated) : null }
}

/** The snowfall figure a row is ranked by: fallen in the last 24 / 72 h, or forecast for 3 / 7 / 14 days. */
export type Metric = 'p24' | 'p72' | 'w3' | 'w7' | 'w14'

export const METRICS: readonly { id: Metric; label: string; short: string; past: boolean }[] = [
  { id: 'p24', label: 'Last 24 hours', short: '24h', past: true },
  { id: 'p72', label: 'Last 72 hours', short: '72h', past: true },
  { id: 'w3', label: 'Next 3 days', short: '3 days', past: false },
  { id: 'w7', label: 'Next 7 days', short: '7 days', past: false },
  { id: 'w14', label: 'Next 14 days', short: '14 days', past: false },
]

export const LEVEL_INDEX: Record<Level, number> = { base: 0, mid: 1, top: 2 }
const WINDOW_INDEX: Partial<Record<Metric, number>> = { w3: 0, w7: 1, w14: 2 }

/** Snowfall in cm for a metric at a level; null when there is no forecast. */
export function snowOf(f: ResortForecast | undefined, metric: Metric, level: Level): number | null {
  if (!f) return null
  const li = LEVEL_INDEX[level]
  if (metric === 'p24') return f.p[li][0]
  if (metric === 'p72') return f.p[li][1]
  return f.w[li][WINDOW_INDEX[metric]!]
}

/** A reading stops standing for "the last 24 hours" once it is this old. */
const FRESH_MS = 36 * 3_600_000

/** The station reading of snow fallen over a past period, if a fresh one exists. */
export function measuredFall(row: Row, metric: Metric, nowMs = Date.now()): Observation | null {
  if (!row.o || (metric !== 'p24' && metric !== 'p72')) return null
  // New snow measured on a board or gauge beats a change in depth, which settling shrinks.
  const kinds = metric === 'p24' ? (['new24', 'change24'] as const) : (['new72', 'change72'] as const)
  for (const k of kinds) {
    const o = row.o.find((x) => x.k === k && nowMs - Date.parse(x.at) <= FRESH_MS)
    if (o) return o
  }
  return null
}

/** Snow on the ground at the nearest station, if one reports it. */
export function measuredDepth(row: Row): Observation | null {
  return row.o?.find((x) => x.k === 'depth') ?? null
}

/**
 * The figure a mountain is ranked by. A forecast comes from the models; snow that has already
 * fallen comes from a station where one measured it, and from the models' estimate elsewhere.
 */
export function valueOf(row: Row, metric: Metric, level: Level, nowMs = Date.now()): number | null {
  return measuredFall(row, metric, nowMs)?.v ?? snowOf(row.f, metric, level)
}

export interface Spread {
  lo: number
  hi: number
  /** Models that cover the whole window. */
  n: number
}

/** The lowest and highest model behind a forecast figure. Past figures have none. */
export function spreadOf(f: ResortForecast | undefined, metric: Metric, level: Level): Spread | null {
  const wi = WINDOW_INDEX[metric]
  if (!f || wi == null) return null
  const li = LEVEL_INDEX[level]
  const lo = f.lo[li][wi]
  const hi = f.hi[li][wi]
  return lo == null || hi == null ? null : { lo, hi, n: f.n[wi] }
}

export interface Confidence {
  /** 3 high, 2 medium, 1 low. */
  level: 1 | 2 | 3
  /** Width of the models' middle half as a share of the consensus (see modelSpread). */
  spread: number
}

export const CONFIDENCE_LABEL: Record<Confidence['level'], string> = { 3: 'High confidence', 2: 'Medium confidence', 1: 'Low confidence' }

/**
 * How far to trust a forecast total, in three steps. High: the middle half of the models sit
 * within a band half as wide as the total (roughly plus or minus 25 %). Medium: within a band as
 * wide as the total. Low: wider still. On the 2026-11-17 snapshot that put about a third of
 * mountains at high, half at medium and a fifth at low.
 * A 14-day total never rates above medium: skill that far out is limited whatever the models say.
 * Judged at mid elevation, where every model's own total is kept. Null for past snowfall.
 */
export function confidenceOf(f: ResortForecast | undefined, metric: Metric): Confidence | null {
  const wi = WINDOW_INDEX[metric]
  if (!f || wi == null) return null
  return rateSpread(modelSpread(f.mm.map((m) => m[wi]), f.w[1][wi]), metric === 'w14')
}

/** Turn a model spread into a confidence level; `longRange` caps it at medium. */
export function rateSpread(spread: number | null, longRange: boolean): Confidence | null {
  if (spread == null) return null
  const level = spread <= 0.5 ? 3 : spread <= 1 ? 2 : 1
  return { level: longRange && level === 3 ? 2 : level, spread }
}

export type SortKey = 'snow' | 'depth' | 'near' | 'vert' | 'base' | 'top' | 'name' | 'agree' | 'km'

export const SORTS: readonly { id: SortKey; label: string; defaultDesc: boolean }[] = [
  { id: 'snow', label: 'Most snow', defaultDesc: true },
  { id: 'depth', label: 'Deepest snow on the ground', defaultDesc: true },
  { id: 'near', label: 'Nearest to me', defaultDesc: false },
  { id: 'vert', label: 'Vertical drop', defaultDesc: true },
  { id: 'top', label: 'Summit elevation', defaultDesc: true },
  { id: 'base', label: 'Base elevation', defaultDesc: true },
  { id: 'km', label: 'Size (km of runs)', defaultDesc: true },
  { id: 'agree', label: 'Confidence', defaultDesc: true },
  { id: 'name', label: 'Name', defaultDesc: false },
]

export interface LatLon {
  lat: number
  lon: number
}

/** Great-circle distance in km. */
export function distanceKm(a: LatLon, lat: number, lon: number): number {
  const rad = Math.PI / 180
  const h = Math.sin(((lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(lat * rad) * Math.sin(((lon - a.lon) * rad) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

export interface Filters {
  /** Pass slugs; a resort matches when it is on any of them. Empty means every resort. */
  passes: string[]
  region: Region | ''
  minVert: number
  query: string
}

export const NO_FILTERS: Filters = { passes: [], region: '', minVert: 0, query: '' }

export function applyFilters(rows: readonly Row[], f: Filters): Row[] {
  const q = f.query.trim().toLowerCase()
  return rows.filter(
    (row) =>
      (f.passes.length === 0 || row.r.p.some((p) => f.passes.includes(p))) &&
      (f.region === '' || row.region === f.region) &&
      row.vert >= f.minVert &&
      (q === '' || row.search.includes(q)),
  )
}

/** Sorted copy. Rows with no value for the sort key go last in either direction. */
export function sortRows(rows: readonly Row[], key: SortKey, desc: boolean, metric: Metric, level: Level, here?: LatLon | null): Row[] {
  const value = (row: Row): number | string | null => {
    switch (key) {
      case 'snow':
        return valueOf(row, metric, level)
      case 'depth':
        return measuredDepth(row)?.v ?? null
      case 'near':
        return here ? distanceKm(here, row.r.la, row.r.lo) : null
      case 'vert':
        return row.vert
      case 'base':
        return row.r.b
      case 'top':
        return row.r.t
      case 'km':
        return row.r.km
      case 'agree': {
        // Least spread first when descending, so "most confident" leads.
        const c = confidenceOf(row.f, metric)
        return c ? -c.spread : null
      }
      case 'name':
        return row.r.n
    }
  }
  const dir = desc ? -1 : 1
  // Ties, and rows with no value at all, fall back to vertical drop, then name, so the order is
  // stable and meaningful.
  const tie = (a: Row, b: Row) => b.vert - a.vert || a.r.n.localeCompare(b.r.n)
  return rows
    .map((row) => ({ row, v: value(row) }))
    .sort((a, b) => {
      if (a.v == null || b.v == null) return a.v == null ? (b.v == null ? tie(a.row, b.row) : 1) : -1
      if (typeof a.v === 'string' || typeof b.v === 'string') return dir * String(a.v).localeCompare(String(b.v))
      return dir * (a.v - b.v) || tie(a.row, b.row)
    })
    .map((x) => x.row)
}

export interface OpeningLine {
  /** The headline, e.g. "Opens Saturday 21 November". */
  text: string
  /** A few words for a list, e.g. "Opens 21 Nov". */
  short: string
  /** The announcement in the source's own words. */
  detail: string
  source: string
}

/**
 * How to say where a mountain's season stands, from its announced opening. A planned date that
 * has passed is reported as planned, not as open: nobody has confirmed that it happened.
 */
export function openingLine(op: Opening | undefined, nowMs = Date.now()): OpeningLine | null {
  if (!op) return null
  // Announcements move with the weather, so the day this one was read goes with it.
  const read = op.at ? new Date(`${op.at}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }) : null
  // Quotation marks only around the source's own words; a summary of them stands as plain text.
  const says = op.says.trim()
  const stated = op.q ? `The announcement${read ? `, as read on ${read}` : ''}: “${says}”.` : `${read ? `As read on ${read}: ` : ''}${says}${/[.!?…]$/.test(says) ? '' : '.'}`
  const guide = op.via && op.d ? ` This date is ${op.via}'s, not the resort's own.` : ''
  const rest = { detail: (says ? stated : read ? `Read on ${read}.` : '') + guide, source: op.src }
  if (op.s === 'closed') return { text: 'Not opening this season', short: 'Not opening this season', ...rest }
  if (op.s === 'tba') return { text: 'No opening date set', short: 'No opening date set', ...rest }
  const day = op.d ? new Date(`${op.d}T12:00:00Z`) : null
  const long = day?.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
  const brief = day?.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  // The reader's own calendar day: "today" is theirs, and most look at mountains near them.
  const now = new Date(nowMs)
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const weather = op.s === 'tentative' ? ', weather permitting' : ''
  if (op.s === 'open' && (!op.d || op.d <= today)) return { text: long ? `Open for the season since ${long}` : 'Open for the season', short: 'Open for the season', ...rest }
  if (!day) return { text: 'Not open yet', short: 'Not open yet', ...rest }
  // A ski guide's date is its expectation, not the resort's announcement.
  if (op.via) {
    if (op.d === today) return { text: `Expected to open today, ${long}`, short: 'Expected today', ...rest }
    if (op.d! > today) return { text: `Expected to open ${long}`, short: `Expected ${brief}`, ...rest }
    return { text: `Was expected to open ${long}`, short: `Due to open ${brief}`, ...rest }
  }
  if (op.d === today) return { text: `Opens today, ${long}${weather}`, short: 'Opens today', ...rest }
  if (op.d! > today) return { text: `Opens ${long}${weather}`, short: `Opens ${brief}`, ...rest }
  return { text: `Planned opening day was ${long}`, short: `Due to open ${brief}`, ...rest }
}

export interface Storm {
  /** First and last day of the run, "YYYY-MM-DD". */
  from: string
  to: string
  totalCm: number
  peak: { date: string; cm: number }
}

/**
 * The biggest run of consecutive snowy days in a daily forecast: the storm a skier would plan
 * around. A day counts when it brings at least `minDayCm`. Null when no day does.
 */
export function biggestStorm(days: readonly { date: string; mean: number | null }[], minDayCm = 2): Storm | null {
  let best: Storm | null = null
  let run: Storm | null = null
  for (const d of days) {
    const cm = d.mean ?? 0
    if (cm < minDayCm) {
      run = null
      continue
    }
    if (!run) run = { from: d.date, to: d.date, totalCm: 0, peak: { date: d.date, cm } }
    run.to = d.date
    run.totalCm += cm
    if (cm > run.peak.cm) run.peak = { date: d.date, cm }
    if (!best || run.totalCm > best.totalCm) best = { ...run, peak: { ...run.peak } }
  }
  return best
}
