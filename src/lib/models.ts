// The weather models the tracker triangulates. Each is an independent forecast system; ids are
// Open-Meteo model ids. Regional high-resolution nests are blended in by the "seamless" variants
// (HRRR/NAM inside GFS over North America, ICON-D2/EU in Europe, HRDPS in Canada, AROME in France).
//
// Models that fall back to another centre's output outside their own domain (MET Norway, KNMI,
// DMI seamless all fall back to ECMWF) are left out on purpose: they would count ECMWF twice.

export interface ModelDef {
  id: string
  label: string
  org: string
  /** 'ai' models are machine-learned; their precipitation is smoother than a physics model's. */
  kind: 'physics' | 'ai'
  /** Roughly how many days ahead the model reaches. */
  horizonDays: number
}

export const MODELS: readonly ModelDef[] = [
  { id: 'ecmwf_ifs', label: 'ECMWF IFS', org: 'ECMWF', kind: 'physics', horizonDays: 14.5 },
  { id: 'gfs_seamless', label: 'GFS + HRRR', org: 'NOAA', kind: 'physics', horizonDays: 15.8 },
  { id: 'icon_seamless', label: 'ICON', org: 'DWD', kind: 'physics', horizonDays: 7 },
  { id: 'gem_seamless', label: 'GEM', org: 'Environment Canada', kind: 'physics', horizonDays: 9.5 },
  { id: 'jma_seamless', label: 'JMA GSM', org: 'Japan Met. Agency', kind: 'physics', horizonDays: 10.5 },
  { id: 'ukmo_seamless', label: 'UKMO', org: 'UK Met Office', kind: 'physics', horizonDays: 6.5 },
  { id: 'meteofrance_seamless', label: 'ARPEGE + AROME', org: 'Météo-France', kind: 'physics', horizonDays: 4 },
  { id: 'ecmwf_aifs025_single', label: 'ECMWF AIFS', org: 'ECMWF', kind: 'ai', horizonDays: 14.8 },
]

// Left out after measuring it: NOAA's AI model (ncep_aigfs025). On the 2026-11-17 snapshot its
// precipitation ran 1.7 to 1.8 times the median of the other models across about 1,000 mountains,
// it was the wettest model at 4 in 10 of them, and at 1 in 20 it stood more than 2.5 times above
// the next wettest (876 cm in 7 days at Hakuba against 18 to 226 cm from the rest), enough to
// double a consensus on its own. scripts/probe/model-bias.ts repeats the measurement.

export const MODEL_IDS: readonly string[] = MODELS.map((m) => m.id)

/** Forecast windows, in hours ahead of the snapshot time: 3, 7 and 14 days. */
export const WINDOWS_H = [72, 168, 336] as const
export const WINDOW_LABELS = ['3 days', '7 days', '14 days'] as const

export const LEVELS = ['base', 'mid', 'top'] as const
export type Level = (typeof LEVELS)[number]
export const LEVEL_LABELS: Record<Level, string> = { base: 'Base', mid: 'Mid', top: 'Summit' }

/** Days of daily totals kept per resort (today plus 13). */
export const FORECAST_DAYS = 14
/** Hours of history requested, for the "fell in the last 24 / 72 h" estimates. */
export const PAST_DAYS = 3
