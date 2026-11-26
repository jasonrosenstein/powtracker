// Turns the raw hourly model output for one mountain into the numbers the tracker shows.
// Used by the ingest script for the global snapshot and by the app for a resort's live detail.
//
// The consensus is built hour by hour: each hour's snowfall is the mean of every model that
// reaches that hour, and totals are sums of those hours. So the first days draw on every model
// and the last days on the few that reach them, the running total never steps down when a
// short-range model drops out, and daily totals add up to the window totals.
// The range (lowest and highest model) comes from the models that cover the whole window.
import { FORECAST_DAYS, MODEL_IDS, PAST_DAYS, WINDOWS_H } from './models.ts'
import { meanSeries, r1, snowFraction, snowSeries, tempAt, windowSum, type Series } from './snow.ts'
import type { ResortForecast } from './types.ts'

/** One location of an Open-Meteo multi-model hourly response. */
export interface OpenMeteoLocation {
  elevation: number
  utc_offset_seconds: number
  hourly: { time: string[] } & Record<string, (number | null)[] | string[] | undefined>
}

/** One location's hourly output, with one precipitation and temperature series per model. */
export interface HourlyModels {
  /** Local wall-clock hours, "YYYY-MM-DDTHH:MM", starting at local midnight PAST_DAYS ago. */
  time: string[]
  utcOffsetSeconds: number
  /** Elevation the temperatures were given for, metres. */
  zRef: number
  precip: Record<string, Series>
  temp: Record<string, Series>
}

export function parseHourly(loc: OpenMeteoLocation, models: readonly string[] = MODEL_IDS): HourlyModels {
  const precip: Record<string, Series> = {}
  const temp: Record<string, Series> = {}
  for (const m of models) {
    precip[m] = (loc.hourly[`precipitation_${m}`] as Series | undefined) ?? []
    temp[m] = (loc.hourly[`temperature_2m_${m}`] as Series | undefined) ?? []
  }
  return { time: loc.hourly.time, utcOffsetSeconds: loc.utc_offset_seconds, zRef: loc.elevation, precip, temp }
}

/** UTC milliseconds of hourly index `i`. */
export function timeAt(h: HourlyModels, i: number): number {
  return Date.parse(h.time[0] + 'Z') - h.utcOffsetSeconds * 1000 + i * 3_600_000
}

/**
 * Index of the last hour that has fully elapsed at `nowMs`. Open-Meteo stamps precipitation with
 * the end of the hour it fell in, so "the next 72 hours" is the 72 values after this index.
 */
export function nowIndex(h: HourlyModels, nowMs: number): number {
  return Math.floor((nowMs - timeAt(h, 0)) / 3_600_000)
}

/** Index of local midnight starting forecast day `d` (0 = today). */
export function dayStartIndex(d: number): number {
  return (PAST_DAYS + d) * 24
}

/** Hourly snowfall at elevation `z`: one series per model, plus their hour-by-hour mean. */
export interface LevelSnow {
  z: number
  byModel: (number | null)[][]
  mean: (number | null)[]
}

export function snowAtLevel(h: HourlyModels, z: number, models: readonly string[] = MODEL_IDS): LevelSnow {
  const byModel = models.map((m) => snowSeries(h.precip[m] ?? [], h.temp[m] ?? [], h.zRef, z))
  return { z, byModel, mean: meanSeries(byModel) }
}

/** Liquid rain in mm, not snow depth. Split each model's precipitation at the chosen height
 * before averaging: a cold, wet model and a warm, dry model do not predict rain together. */
export function dailyRainAtLevel(h: HourlyModels, z: number, models: readonly string[] = MODEL_IDS): (number | null)[] {
  const hourly = meanSeries(models.map(m => (h.precip[m] ?? []).map((p, i) => {
    const t = h.temp[m]?.[i]
    return p == null || t == null ? null : Math.max(0, p) * (1 - snowFraction(tempAt(t, h.zRef, z)))
  })))
  return Array.from({ length: FORECAST_DAYS }, (_, d) => windowSum(hourly, dayStartIndex(d) + 1, 24))
}

export interface WindowTotal {
  /** Consensus total; null when the models do not reach the end of the window. */
  mean: number | null
  /** Lowest and highest total among the models that cover the whole window. */
  lo: number | null
  hi: number | null
  n: number
  /** Each model's own total, null where it stops short. */
  byModel: (number | null)[]
}

/** Totals over `hours` starting after index `start` (exclusive). */
export function windowTotal(s: LevelSnow, start: number, hours: number): WindowTotal {
  const byModel = s.byModel.map((series) => windowSum(series, start + 1, hours))
  const covering = byModel.filter((v): v is number => v != null)
  const mean = windowSum(s.mean, start + 1, hours)
  // The consensus also draws on shorter models early in the window, so it can fall just outside
  // the full-window models' range: widen the range to hold it.
  const lo = covering.length ? Math.min(...covering, mean ?? Infinity) : null
  const hi = covering.length ? Math.max(...covering, mean ?? -Infinity) : null
  return { mean, lo, hi, n: covering.length, byModel }
}

/** The snapshot entry for one resort: totals at base, mid and summit for every window. */
export function summarise(h: HourlyModels, base: number, top: number, nowMs: number, models: readonly string[] = MODEL_IDS): ResortForecast {
  const levels = [base, (base + top) / 2, top]
  const now = nowIndex(h, nowMs)
  const rain: (number | null)[][] = []
  const out: ResortForecast = { rain, w: [], lo: [], hi: [], n: [0, 0, 0], d: [], p: [], mm: [], t: [null, null], d0: h.time[dayStartIndex(0)]?.slice(0, 10) ?? '' }

  levels.forEach((z, li) => {
    const snow = snowAtLevel(h, z, models)
    const totals = WINDOWS_H.map((hours) => windowTotal(snow, now, hours))
    out.w.push(totals.map((t) => r1(t.mean)))
    out.lo.push(totals.map((t) => r1(t.lo)))
    out.hi.push(totals.map((t) => r1(t.hi)))
    if (li === 1) {
      out.n = totals.map((t) => t.n)
      out.mm = models.map((_, mi) => totals.map((t) => r1(t.byModel[mi])))
    }
    out.d.push(Array.from({ length: FORECAST_DAYS }, (_, day) => r1(windowSum(snow.mean, dayStartIndex(day) + 1, 24))))
    // Keep trace rainfall positive in the compact snapshot; rounding it to 0 would mean dry.
    rain.push(dailyRainAtLevel(h, z, models).map(mm => mm != null && mm > 0 && mm < 0.1 ? Number(mm.toPrecision(2)) : r1(mm)))
    out.p.push([24, 72].map((hours) => r1(windowSum(snow.mean, now - hours + 1, hours))))
  })

  // Coldest and warmest hour at mid elevation over the next 72 h, from the models' mean temperature.
  const temp = meanSeries(models.map((m) => h.temp[m] ?? []))
  for (let i = now + 1; i <= now + 72; i++) {
    const tRef = temp[i]
    if (tRef == null) continue
    const t = tempAt(tRef, h.zRef, levels[1])
    if (out.t[0] == null || t < out.t[0]) out.t[0] = t
    if (out.t[1] == null || t > out.t[1]) out.t[1] = t
  }
  out.t = [r1(out.t[0]), r1(out.t[1])]
  return out
}
