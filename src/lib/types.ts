// Shapes of the two data files the app loads: public/data/resorts.json (the resort list, rebuilt
// when rosters or OpenSkiMap change) and public/data/forecast.json (the snapshot, rebuilt on a
// schedule). Keys are short because both files are downloaded on every visit.

export interface PassDef {
  slug: string
  label: string
  season: string
}

export interface Resort {
  /** Short id: the leading characters of the OpenSkiMap id. */
  id: string
  /** Name. */
  n: string
  /** ISO 3166-1 alpha-2 country code. */
  cc: string
  /** Country, region. */
  co: string
  rg: string
  la: number
  lo: number
  /** Base and summit elevation, metres. Vertical is t - b. */
  b: number
  t: number
  /** Kilometres of downhill runs and number of lifts mapped in OpenStreetMap. */
  km: number
  li: number
  /** Slugs of the passes that cover it. */
  p: string[]
  /** Website. */
  w?: string
}

export interface ResortsFile {
  generated: string
  source: string
  passes: PassDef[]
  resorts: Resort[]
}

/** Per level: [base, mid, summit]. Per window: [3 d, 7 d, 14 d]. All snowfall in cm. */
export interface ResortForecast {
  /** Consensus (multi-model mean) snowfall, [level][window]. Null when no model covers it. */
  w: (number | null)[][]
  /** Lowest and highest model, [level][window]. */
  lo: (number | null)[][]
  hi: (number | null)[][]
  /** Models covering each window. */
  n: number[]
  /** Daily consensus snowfall for today and the 13 days after, [level][day]. */
  d: (number | null)[][]
  /** Model-estimated snowfall over the last 24 and 72 hours, [level][24 h, 72 h]. */
  p: (number | null)[][]
  /** Each model's own totals at mid elevation, [model][window], in the order of `models`. */
  mm: (number | null)[][]
  /** Coldest and warmest hour at mid elevation over the next 72 hours, °C. */
  t: [number | null, number | null]
  /** Local calendar date of day 0. */
  d0: string
}

/** One reading from a snow station near a resort. */
export interface Observation {
  /**
   * depth: snow on the ground. new24 / new72: new snow measured over 24 / 72 h.
   * change24 / change72: how much deeper the snow is than 24 / 72 h ago.
   */
  k: 'depth' | 'new24' | 'change24' | 'new72' | 'change72'
  /** Centimetres. */
  v: number
  /** When it was measured (ISO, UTC). */
  at: string
  /** Station name, its elevation in metres, and its distance from the resort in km. */
  st: string
  z: number
  km: number
  src: string
}

export interface ObservationsFile {
  generated: string
  sources: string[]
  resorts: Record<string, Observation[]>
}

export interface ForecastFile {
  /** When the snapshot was taken (ISO, UTC). Windows count from here. */
  generated: string
  models: string[]
  windowsH: number[]
  days: number
  resorts: Record<string, ResortForecast>
}
