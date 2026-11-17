// A resort's live detail: the current hourly output of every model, fetched straight from
// Open-Meteo in the browser, and the series the detail charts draw from it.
import { dayStartIndex, nowIndex, parseHourly, snowAtLevel, timeAt, windowTotal, type HourlyModels, type LevelSnow, type OpenMeteoLocation, type WindowTotal } from './forecast.ts'
import { FORECAST_DAYS, MODEL_IDS, WINDOWS_H } from './models.ts'
import { forecastUrl } from './openmeteo.ts'
import { LAPSE_C_PER_M, meanSeries, tempAt, windowSum } from './snow.ts'
import type { Resort } from './types.ts'

export interface Live {
  h: HourlyModels
  fetchedMs: number
  /** Index of the last elapsed hour: the forecast starts after it. */
  now: number
  /** Hours of forecast shown: from now to the end of the 14-day window. */
  hours: number
}

export async function fetchLive(r: Resort, signal?: AbortSignal): Promise<Live> {
  const res = await fetch(forecastUrl([{ lat: r.la, lon: r.lo, elevation: (r.b + r.t) / 2 }]), { signal })
  if (!res.ok) {
    // Open-Meteo explains itself in the body, e.g. which rate limit this network has reached.
    const reason = await res.json().then((b: { reason?: string }) => b.reason, () => undefined)
    throw new Error(reason ?? `Open-Meteo returned HTTP ${res.status}`)
  }
  const h = parseHourly((await res.json()) as OpenMeteoLocation)
  const fetchedMs = Date.now()
  return { h, fetchedMs, now: nowIndex(h, fetchedMs), hours: WINDOWS_H[WINDOWS_H.length - 1] }
}

/** One local day's snowfall: the consensus, and the range across models where it is known. */
export interface DayTotal {
  date: string
  mean: number | null
  lo: number | null
  hi: number | null
  byModel: (number | null)[]
  /** Coldest and warmest hour of the day at this elevation, °C. Null without live model data. */
  tLo: number | null
  tHi: number | null
}

export interface LevelView {
  snow: LevelSnow
  totals: WindowTotal[]
  /** UTC ms of each forecast hour, and the running totals from now. */
  times: number[]
  cumMean: (number | null)[]
  cumByModel: (number | null)[][]
  /** Daily totals for today and the 13 days after. */
  days: DayTotal[]
  past: (number | null)[]
}

/** The same daily totals from the snapshot, for when live model data cannot be fetched. */
export function snapshotDays(d0: string, daily: readonly (number | null)[]): DayTotal[] {
  const start = Date.parse(`${d0}T00:00:00Z`)
  return daily.map((mean, i) => ({ date: new Date(start + i * 86_400_000).toISOString().slice(0, 10), mean, lo: null, hi: null, byModel: [], tLo: null, tHi: null }))
}

function runningTotal(series: readonly (number | null)[], start: number, hours: number): (number | null)[] {
  const out: (number | null)[] = []
  let sum = 0
  for (let i = start + 1; i <= start + hours; i++) {
    const v = series[i]
    if (v == null) {
      out.push(null)
      continue
    }
    sum += v
    out.push(sum)
  }
  return out
}

/** Everything the detail panel shows for one elevation. */
export function levelView(live: Live, z: number): LevelView {
  const { h, now, hours } = live
  const snow = snowAtLevel(h, z)
  const temp = meanSeries(MODEL_IDS.map((m) => h.temp[m] ?? []))
  const days = Array.from({ length: FORECAST_DAYS }, (_, d) => {
    const start = dayStartIndex(d)
    const byModel = snow.byModel.map((s) => windowSum(s, start + 1, 24))
    const vals = byModel.filter((v): v is number => v != null)
    const temps = temp.slice(start, start + 24).filter((t): t is number => t != null).map((t) => tempAt(t, h.zRef, z))
    return {
      date: h.time[start]?.slice(0, 10) ?? '',
      mean: windowSum(snow.mean, start + 1, 24),
      lo: vals.length ? Math.min(...vals) : null,
      hi: vals.length ? Math.max(...vals) : null,
      byModel,
      tLo: temps.length ? Math.min(...temps) : null,
      tHi: temps.length ? Math.max(...temps) : null,
    }
  })
  return {
    snow,
    totals: WINDOWS_H.map((w) => windowTotal(snow, now, w)),
    times: Array.from({ length: hours }, (_, k) => timeAt(h, now + 1 + k)),
    cumMean: runningTotal(snow.mean, now, hours),
    cumByModel: snow.byModel.map((s) => runningTotal(s, now, hours)),
    days,
    past: [24, 72].map((hrs) => windowSum(snow.mean, now - hrs + 1, hrs)),
  }
}

/** Consensus total for a window at each of a ladder of elevations, lowest first. */
export function elevationProfile(live: Live, elevations: readonly number[], windowHours: number): { z: number; mean: number | null }[] {
  return elevations.map((z) => ({ z, mean: windowTotal(snowAtLevel(live.h, z), live.now, windowHours).mean }))
}

export interface Meteogram {
  times: number[]
  /** Elevation (m) above which precipitation falls mostly as snow: where the air is +1 °C. */
  snowLine: (number | null)[]
  /** Consensus precipitation, mm per hour. */
  precip: (number | null)[]
  /** Consensus temperature at the reference elevation, °C. */
  tempRef: (number | null)[]
  zRef: number
}

export function meteogram(live: Live): Meteogram {
  const { h, now, hours } = live
  const slice = <T,>(s: readonly T[]): T[] => s.slice(now + 1, now + 1 + hours)
  const temp = meanSeries(MODEL_IDS.map((m) => h.temp[m] ?? []))
  const precip = meanSeries(MODEL_IDS.map((m) => h.precip[m] ?? []))
  return {
    times: Array.from({ length: hours }, (_, k) => timeAt(h, now + 1 + k)),
    snowLine: slice(temp).map((t) => (t == null ? null : h.zRef + (t - 1) / LAPSE_C_PER_M)),
    precip: slice(precip),
    tempRef: slice(temp),
    zRef: h.zRef,
  }
}
