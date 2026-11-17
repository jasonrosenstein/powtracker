// The snowfall colour scale: one hue, six classes, light to dark as snow deepens (reversed on a
// dark surface, where the deepest class is the lightest). Used by the map, its legend and the
// snowfall badges in the rankings.
//
// Both ramps pass the ordinal checks of the dataviz palette validator against the app's card
// surfaces (#ffffff and #101826): monotone lightness, visible steps, light end at 2:1 or better.
import type { Units } from './units.ts'

const RAMP_LIGHT = ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281', '#0b2c57'] as const
const RAMP_DARK = ['#1c5cab', '#2a78d6', '#5598e7', '#86b6ef', '#b7d3f6', '#e4effd'] as const
/** Text set inside each class's fill: near-black on the light steps, white on the dark ones. */
const INK_LIGHT = ['#0c1524', '#0c1524', '#ffffff', '#ffffff', '#ffffff', '#ffffff'] as const
const INK_DARK = ['#ffffff', '#ffffff', '#0c1524', '#0c1524', '#0c1524', '#0c1524'] as const
const NONE_LIGHT = '#a4adba'
const NONE_DARK = '#4e5b70'

export interface SnowScale {
  none: string
  ramp: readonly string[]
  ink: readonly string[]
  /** Lower bound of each class in cm. Below the first, a mountain reads as "no snow". */
  breaksCm: readonly number[]
  /** The same bounds as printed in the legend, in display units. */
  labels: readonly string[]
}

/** Class bounds are round numbers in the units on screen: 1 to 100 cm, or half an inch to 40 inches. */
export function snowScale(dark: boolean, units: Units): SnowScale {
  const bounds = units === 'metric' ? [1, 5, 15, 30, 60, 100] : [0.5, 2, 6, 12, 24, 40]
  return {
    none: dark ? NONE_DARK : NONE_LIGHT,
    ramp: dark ? RAMP_DARK : RAMP_LIGHT,
    ink: dark ? INK_DARK : INK_LIGHT,
    breaksCm: units === 'metric' ? bounds : bounds.map((inches) => inches * 2.54),
    labels: bounds.map(String),
  }
}

/** Index of the class a total falls in, or -1 for "no snow". */
export function snowClass(cm: number | null, scale: SnowScale): number {
  if (cm == null || cm < scale.breaksCm[0]) return -1
  let i = 0
  while (i + 1 < scale.breaksCm.length && cm >= scale.breaksCm[i + 1]) i++
  return i
}

export function snowColor(cm: number | null, scale: SnowScale): string {
  const i = snowClass(cm, scale)
  return i < 0 ? scale.none : scale.ramp[i]
}

/** Circle radius in px at full zoom: area grows with the amount, capped. */
export function snowRadius(cm: number | null, scale: SnowScale): number {
  if (snowClass(cm, scale) < 0) return 3
  return Math.min(22, 4 + Math.sqrt(cm as number) * 1.5)
}
