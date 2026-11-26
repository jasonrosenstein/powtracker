import { FORECAST_DAYS } from './models.ts'
import type { Resort } from './types.ts'

/** Strongest forecast 10 m wind sampled on the local day (not a gust), with its own direction. */
export interface DailyWind { kmh: number; fromDegrees: number | null }
export type WindDays = Record<string, DailyWind>
interface HourlyWind { time: string[]; wind_speed_10m: (number | null)[]; wind_direction_10m?: (number | null)[] }

export function dailyPeakWind(h: HourlyWind): WindDays {
  const days: WindDays = {}
  for (let i = 0; i < h.time.length;) {
    const start = i, date = h.time[i].slice(0, 10)
    let kmh = -1, fromDegrees: number | null = null, complete = true
    while (i < h.time.length && h.time[i].startsWith(date)) {
      const speed = h.wind_speed_10m[i], dir = h.wind_direction_10m?.[i]
      if (speed == null || !Number.isFinite(speed) || speed < 0) complete = false
      else if (speed > kmh) {
        kmh = speed
        fromDegrees = speed > 0 && dir != null && dir >= 0 && dir <= 360 ? dir % 360 : null
      }
      i++
    }
    // Do not report a maximum from a truncated day or a model that has stopped reporting.
    if (complete && i - start >= 23 && h.time[start].endsWith('T00:00') && h.time[i - 1].endsWith('T23:00')) {
      days[date] = { kmh, fromDegrees }
    }
  }
  return days
}

/** One best-match wind forecast for the open mountain; no extra variables in the global ingest. */
export async function fetchDailyWind(r: Resort, signal: AbortSignal): Promise<WindDays> {
  const q = new URLSearchParams({ latitude: String(r.la), longitude: String(r.lo), elevation: String(Math.round((r.b + r.t) / 2)),
    hourly: 'wind_speed_10m,wind_direction_10m', forecast_days: String(FORECAST_DAYS), wind_speed_unit: 'kmh', timezone: 'auto' })
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, { signal })
  if (!res.ok) throw new Error(`Wind forecast returned HTTP ${res.status}`)
  return dailyPeakWind((await res.json()).hourly)
}
