// Open-Meteo request building, shared by the ingest script and the app's live resort detail.
import { MODEL_IDS, PAST_DAYS } from './models.ts'

export interface Spot {
  lat: number
  lon: number
  /** Elevation to downscale temperature to, metres. */
  elevation: number
}

/** Forecast days requested: 15, so a 14-day window that starts mid-day is still fully covered. */
export const REQUEST_FORECAST_DAYS = 15

/**
 * Open-Meteo counts a request as more than one call when it asks for more than 10 variables
 * (variables x models), more than 14 days, or several locations. This is that weight.
 */
export function callWeight(locations: number, variables: number, models: number, days: number): number {
  return locations * Math.max(1, (variables * models) / 10) * Math.max(1, days / 14)
}

/**
 * URL for the hourly multi-model forecast at one or more spots. With an API key the request goes
 * to the commercial endpoint, which has no free-tier rate limit.
 */
export function forecastUrl(
  spots: readonly Spot[],
  opts: { hourly?: readonly string[]; models?: readonly string[]; apiKey?: string } = {},
): string {
  const hourly = opts.hourly ?? ['precipitation', 'temperature_2m']
  const models = opts.models ?? MODEL_IDS
  const host = opts.apiKey ? 'customer-api.open-meteo.com' : 'api.open-meteo.com'
  const q = new URLSearchParams({
    latitude: spots.map((s) => s.lat.toFixed(4)).join(','),
    longitude: spots.map((s) => s.lon.toFixed(4)).join(','),
    elevation: spots.map((s) => Math.round(s.elevation)).join(','),
    hourly: hourly.join(','),
    models: models.join(','),
    past_days: String(PAST_DAYS),
    forecast_days: String(REQUEST_FORECAST_DAYS),
    timezone: 'auto',
  })
  if (opts.apiKey) q.set('apikey', opts.apiKey)
  // Commas are legal in a query string and Open-Meteo expects them bare.
  return `https://${host}/v1/forecast?${q.toString().replaceAll('%2C', ',')}`
}
