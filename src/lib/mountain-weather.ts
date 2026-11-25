// The weather on the mountain itself for the next two days: what it feels like at the summit,
// how hard the wind is blowing, how far you can see. One small request to Open-Meteo's blended
// "best match" forecast when a mountain is opened.
import { tempAt } from './snow.ts'
import type { Resort } from './types.ts'

export interface MountainHour {
  /** UTC ms. */
  time: number
  /** Local hour of day, 0 to 23. */
  hour: number
  tempTop: number
  tempBase: number
  feelsTop: number
  /** km/h at the summit. */
  wind: number | null
  gust: number | null
  /** Meteorological degrees FROM true north. A missing direction is not north. */
  fromDegrees: number | null
  /** Compass point the wind blows from, e.g. "NW". */
  from: string
  /** Sky in a word, and the icon that goes with it. */
  sky: Sky
  /** Metres; null when the model gives none. */
  visibility: number | null
  isDay: boolean
}

export interface MountainWeather {
  hours: MountainHour[]
  /** Today's sunrise and sunset, local "HH:MM". */
  sunrise: string
  sunset: string
  offsetSec: number
}

export type Sky = 'clear' | 'partly' | 'cloudy' | 'fog' | 'snow' | 'heavy-snow' | 'rain' | 'storm'

export const SKY_WORDS: Record<Sky, string> = {
  clear: 'Clear',
  partly: 'Partly cloudy',
  cloudy: 'Cloudy',
  fog: 'Fog',
  snow: 'Snow',
  'heavy-snow': 'Heavy snow',
  rain: 'Rain',
  storm: 'Thunderstorm',
}

/** WMO weather code to a sky word. */
export function skyOf(code: number): Sky {
  if (code <= 1) return 'clear'
  if (code === 2) return 'partly'
  if (code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if (code === 75 || code === 86) return 'heavy-snow'
  if ((code >= 71 && code <= 77) || code === 85) return 'snow'
  if (code >= 95) return 'storm'
  return 'rain'
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
export const compass = (degrees: number): string => POINTS[Math.round(((degrees % 360) + 360) % 360 / 45) % 8]

/**
 * What the wind means for the lifts, by gust at the summit. Chairlifts commonly go on hold
 * somewhere between 60 and 80 km/h, exposed gondolas and trams earlier.
 */
export function windAdvice(gustKmh: number): { level: 0 | 1 | 2; text: string } {
  if (gustKmh >= 80) return { level: 2, text: 'Gale-force gusts at the summit: expect upper lifts to close.' }
  if (gustKmh >= 55) return { level: 1, text: 'Strong gusts at the summit: exposed lifts may go on wind hold.' }
  return { level: 0, text: '' }
}

type Column = (number | null)[]
interface Response {
  utc_offset_seconds: number
  hourly: {
    time: string[]
    temperature_2m: Column
    apparent_temperature: Column
    wind_speed_10m: Column
    wind_gusts_10m: Column
    wind_direction_10m: Column
    weather_code: Column
    visibility: Column
    is_day: Column
  }
  daily: { sunrise: string[]; sunset: string[] }
}

export async function fetchMountainWeather(r: Resort, signal?: AbortSignal): Promise<MountainWeather> {
  const vars = 'temperature_2m,apparent_temperature,wind_speed_10m,wind_gusts_10m,wind_direction_10m,weather_code,visibility,is_day'
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${r.la}&longitude=${r.lo}&elevation=${r.t}` +
    `&hourly=${vars}&daily=sunrise,sunset&forecast_days=3&wind_speed_unit=kmh&timezone=auto`
  const res = await fetch(url, { signal })
  if (!res.ok) {
    const reason = await res.json().then((b: { reason?: string }) => b.reason, () => undefined)
    throw new Error(reason ?? `Open-Meteo returned HTTP ${res.status}`)
  }
  return parseMountainWeather((await res.json()) as Response, r, Date.now())
}

export function parseMountainWeather(body: Response, r: Pick<Resort, 'b' | 't'>, nowMs: number): MountainWeather {
  const h = body.hourly
  const offsetSec = body.utc_offset_seconds
  const hours: MountainHour[] = []
  h.time.forEach((stamp, i) => {
    const time = Date.parse(`${stamp}Z`) - offsetSec * 1000
    const temp = h.temperature_2m[i]
    // From the current hour to 48 hours ahead.
    if (temp == null || time < nowMs - 3_600_000 || time > nowMs + 48 * 3_600_000) return
    const speed = h.wind_speed_10m[i], gust = h.wind_gusts_10m[i], dir = h.wind_direction_10m[i]
    const fromDegrees = dir != null && dir >= 0 && dir <= 360 ? dir % 360 : null
    hours.push({
      time,
      hour: Number(stamp.slice(11, 13)),
      tempTop: temp,
      tempBase: tempAt(temp, r.t, r.b),
      feelsTop: h.apparent_temperature[i] ?? temp,
      wind: speed != null && Number.isFinite(speed) && speed >= 0 ? speed : null,
      gust: gust != null && Number.isFinite(gust) && gust >= 0 ? gust : null,
      fromDegrees,
      from: fromDegrees != null && speed != null && speed > 0 ? compass(fromDegrees) : '',
      sky: skyOf(h.weather_code[i] ?? 3),
      visibility: h.visibility[i],
      isDay: h.is_day[i] === 1,
    })
  })
  return { hours, sunrise: body.daily.sunrise[0]?.slice(11, 16) ?? '', sunset: body.daily.sunset[0]?.slice(11, 16) ?? '', offsetSec }
}
