// The snow engine: turns a weather model's hourly precipitation and temperature into snowfall
// at any elevation on a mountain. Shared by the ingest script (Node) and the app (browser), so a
// resort's detail charts and the global rankings always agree.
//
// Why not use the model's own snowfall field? Global models resolve a mountain as one grid cell
// tens of kilometres wide: their snowfall is for that cell's average height, not for the base or
// the summit, and providers convert it to depth at a fixed 7:1 ratio. Here the phase (rain or
// snow) and the density of new snow are worked out per elevation from temperature instead.

/** Temperature drop with height, °C per metre (standard atmosphere, 6.5 °C per km). */
export const LAPSE_C_PER_M = 0.0065

/** Temperature at elevation `z`, given the temperature at `zRef` (both metres). */
export function tempAt(tRefC: number, zRef: number, z: number): number {
  return tRefC - LAPSE_C_PER_M * (z - zRef)
}

/**
 * Share of precipitation that falls as snow at air temperature `tC`.
 * All snow at 0 °C and below, all rain at +2 °C and above, linear between: the 50 % point sits
 * at +1 °C, the Northern Hemisphere average found by Jennings et al. (2018).
 */
export function snowFraction(tC: number): number {
  if (tC <= 0) return 1
  if (tC >= 2) return 0
  return 1 - tC / 2
}

// Snow-to-liquid ratio (cm of new snow per cm of water) against air temperature where it falls.
// Wet snow near freezing is dense; ratios peak where dendrites grow best (about -12 to -18 °C)
// and fall off again in very cold air, which makes small, dense crystals. The anchors follow
// observed climatologies (Alta averages about 14:1 near -9 °C; the Sierra about 9:1 near -2 °C).
const SLR_POINTS: readonly (readonly [number, number])[] = [
  [-30, 12],
  [-25, 13],
  [-18, 16],
  [-15, 17],
  [-12, 16.5],
  [-8, 14.5],
  [-5, 12.5],
  [-2, 10],
  [0, 8],
  [1, 6],
  [2, 5],
]

export function snowLiquidRatio(tC: number): number {
  const pts = SLR_POINTS
  if (tC <= pts[0][0]) return pts[0][1]
  for (let i = 1; i < pts.length; i++) {
    if (tC <= pts[i][0]) {
      const [t0, r0] = pts[i - 1]
      const [t1, r1] = pts[i]
      return r0 + ((r1 - r0) * (tC - t0)) / (t1 - t0)
    }
  }
  return pts[pts.length - 1][1]
}

/** New snow in cm from `precipMm` of precipitation falling at air temperature `tC`. */
export function snowCm(precipMm: number, tC: number): number {
  if (precipMm <= 0) return 0
  return (precipMm * snowFraction(tC) * snowLiquidRatio(tC)) / 10
}

export type Series = readonly (number | null)[]

/**
 * Hourly snowfall (cm) at elevation `z` from one model's hourly precipitation (mm) and
 * temperature (°C at `zRef`). Hours the model does not cover stay null.
 */
export function snowSeries(precipMm: Series, tempRefC: Series, zRef: number, z: number): (number | null)[] {
  const out = new Array<number | null>(precipMm.length)
  for (let i = 0; i < precipMm.length; i++) {
    const p = precipMm[i]
    const t = tempRefC[i]
    out[i] = p == null || t == null ? null : snowCm(p, tempAt(t, zRef, z))
  }
  return out
}

/**
 * Sum of `series[start, start + hours)`. Null unless the model covers at least `minCoverage` of
 * the window: a model that stops at day 7 must not pass as a low 14-day total.
 */
export function windowSum(series: Series, start: number, hours: number, minCoverage = 0.95): number | null {
  if (start < 0) return null
  let sum = 0
  let n = 0
  const end = Math.min(series.length, start + hours)
  for (let i = start; i < end; i++) {
    const v = series[i]
    if (v != null) {
      sum += v
      n++
    }
  }
  return n >= hours * minCoverage ? sum : null
}

/**
 * Hour-by-hour mean across models: each hour averages the models that have a value there, and is
 * null where none does. Series may differ in length.
 */
export function meanSeries(series: readonly Series[]): (number | null)[] {
  const len = series.reduce((m, s) => Math.max(m, s.length), 0)
  const out = new Array<number | null>(len)
  for (let i = 0; i < len; i++) {
    let sum = 0
    let n = 0
    for (const s of series) {
      const v = s[i]
      if (v != null) {
        sum += v
        n++
      }
    }
    out[i] = n ? sum / n : null
  }
  return out
}

/** The `p` quantile (0 to 1) of a list, interpolating between neighbours. */
export function quantile(values: readonly number[], p: number): number {
  const s = [...values].sort((a, b) => a - b)
  const i = (s.length - 1) * p
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return s[lo] + (s[hi] - s[lo]) * (i - lo)
}

/**
 * How far apart the models are on a total: the width of their middle half (interquartile range)
 * as a share of the consensus. 0 means they match; 1 means the middle half spans as much as the
 * total itself. The middle half is used, not lowest-to-highest, so one wild model cannot decide
 * it. The floor keeps models that split 0 cm from 2 cm from reading as violent disagreement.
 * Null with fewer than three models: two cannot show a middle.
 */
export function modelSpread(totals: readonly (number | null)[], mean: number | null, floorCm = 5): number | null {
  const vals = totals.filter((v): v is number => v != null)
  if (mean == null || vals.length < 3) return null
  return (quantile(vals, 0.75) - quantile(vals, 0.25)) / Math.max(mean, floorCm)
}

const round1 = (v: number): number => Math.round(v * 10) / 10
/** Round to 0.1, passing null through. */
export function r1(v: number | null): number | null {
  return v == null ? null : round1(v)
}
