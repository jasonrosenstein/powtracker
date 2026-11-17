// The animated weather layers the map can draw under the mountains.
//
// Model fields come from Open-Meteo's spatial files: whole-globe grids of one variable at one
// forecast hour, read straight from the browser and drawn as tiles by @openmeteo/mapbox-layer.
// Radar is RainViewer's composite of the world's weather radars for the last two hours.

/** Where Open-Meteo publishes its spatial files. (The package README still names an older host.) */
export const OM_BASE = 'https://openmeteo.s3.amazonaws.com/data_spatial'
/** GFS at 0.13°: the one global model published hourly out to 16 days. */
export const OM_DOMAIN = 'ncep_gfs013'

export interface ModelLayer {
  id: string
  label: string
  /** What the colours measure, for the legend. */
  legend: string
  /** Breakpoints to print under the legend strip, in the scale's own unit. */
  ticks: number[]
}

export const MODEL_LAYERS: readonly ModelLayer[] = [
  { id: 'snowfall_water_equivalent', label: 'Snowfall rate', legend: 'Snowfall, mm of water per hour', ticks: [0.1, 0.5, 1, 2, 4] },
  { id: 'precipitation', label: 'Rain and snow', legend: 'Precipitation, mm per hour', ticks: [0.1, 1, 5, 15, 30] },
  { id: 'temperature_2m', label: 'Temperature', legend: 'Air temperature, °C', ticks: [-30, -15, 0, 15, 30] },
  { id: 'snow_depth', label: 'Snow depth', legend: 'Modelled snow on the ground, m', ticks: [0.1, 0.5, 1, 2, 4] },
]

export type OverlayId = 'none' | 'radar' | string

type RGBA = [number, number, number, number]

/** Snowfall rate has no scale in the package (it falls back to temperature's): one hue, deeper with rate. */
export const SNOWFALL_SCALE = {
  type: 'breakpoint' as const,
  unit: 'mm',
  // The first class is transparent: where it is not snowing the basemap shows through.
  breakpoints: [0, 0.05, 0.1, 0.25, 0.5, 1, 2, 4],
  colors: {
    light: [[183, 211, 246, 0], [183, 211, 246, 0.45], [134, 182, 239, 0.6], [85, 152, 231, 0.7], [42, 120, 214, 0.78], [28, 92, 171, 0.85], [16, 66, 129, 0.9], [13, 54, 107, 0.95]] as RGBA[],
    dark: [[24, 79, 149, 0], [24, 79, 149, 0.5], [28, 92, 171, 0.62], [42, 120, 214, 0.72], [85, 152, 231, 0.8], [134, 182, 239, 0.86], [183, 211, 246, 0.9], [205, 226, 251, 0.95]] as RGBA[],
  },
}

export interface ModelRun {
  /** When the model run started (ISO). */
  reference: string
  /** Forecast hours shown on the timeline: index into the run's valid_times, and its UTC ms. */
  steps: { index: number; ms: number }[]
}

/** The latest complete GFS run, thinned to 3-hourly steps from now to 14 days ahead. */
export async function fetchModelRun(nowMs: number, signal?: AbortSignal): Promise<ModelRun> {
  const res = await fetch(`${OM_BASE}/${OM_DOMAIN}/latest.json`, { signal })
  if (!res.ok) throw new Error(`model run index: HTTP ${res.status}`)
  const meta = (await res.json()) as { reference_time: string; valid_times: string[] }
  const steps = meta.valid_times
    // "2026-11-16T18:00Z": the short form Date.parse does not accept everywhere.
    .map((t, index) => ({ index, ms: Date.parse(t.replace(/Z$/, ':00Z')) }))
    .filter((s) => s.ms >= nowMs - 3 * 3_600_000 && s.ms <= nowMs + 14 * 86_400_000 && new Date(s.ms).getUTCHours() % 3 === 0)
  if (steps.length === 0) throw new Error('the latest model run has no forecast steps in range')
  return { reference: meta.reference_time, steps }
}

/** Tile source URL for one variable at one step of the latest run. */
export function modelSourceUrl(variable: string, stepIndex: number, dark: boolean): string {
  return `om://${OM_BASE}/${OM_DOMAIN}/latest.json?time_step=valid_times_${stepIndex}&variable=${variable}${dark ? '&dark=true' : ''}`
}

export interface RadarFrames {
  host: string
  frames: { time: number; path: string }[]
}

export async function fetchRadar(signal?: AbortSignal): Promise<RadarFrames> {
  const res = await fetch('https://api.rainviewer.com/public/weather-maps.json', { signal })
  if (!res.ok) throw new Error(`radar index: HTTP ${res.status}`)
  const j = (await res.json()) as { host: string; radar: { past: { time: number; path: string }[] } }
  return { host: j.host, frames: j.radar.past }
}

/** Radar tiles: colour scheme 2, smoothed, snow drawn apart from rain. RainViewer serves zoom 0 to 7. */
export function radarTiles(host: string, path: string): string {
  return `${host}${path}/256/{z}/{x}/{y}/2/1_1.png`
}
