// Display units. Everything is stored in metric (cm, m, °C) and converted only when shown.

export type Units = 'metric' | 'imperial'

const CM_PER_IN = 2.54
const FT_PER_M = 3.28084

/** Units to start in: imperial for US locales, metric everywhere else. */
export function defaultUnits(): Units {
  const lang = typeof navigator === 'undefined' ? '' : navigator.language
  return /-(US|LR|MM)$/i.test(lang) ? 'imperial' : 'metric'
}

export function snowUnit(u: Units): string {
  return u === 'metric' ? 'cm' : 'in'
}
/** The snowfall unit spelled out, for sentences. */
export function snowUnitName(u: Units): string {
  return u === 'metric' ? 'centimetres' : 'inches'
}
export function elevUnit(u: Units): string {
  return u === 'metric' ? 'm' : 'ft'
}

/** Snowfall in display units (cm or inches). */
export function snowValue(cm: number, u: Units): number {
  return u === 'metric' ? cm : cm / CM_PER_IN
}

/**
 * Snowfall as a bare number: whole numbers from 10 up, one decimal below (in inches), and
 * "<1" for a trace, so a dusting does not read as a dry forecast.
 */
export function fmtSnowNum(cm: number | null | undefined, u: Units): string {
  if (cm == null) return '–'
  const v = snowValue(cm, u)
  if (v < 0.05) return '0'
  if (u === 'metric') return v < 0.5 ? '<1' : String(Math.round(v))
  if (v < 0.1) return '<0.1'
  return v < 9.95 ? v.toFixed(1) : String(Math.round(v))
}

/** Snowfall with its unit, e.g. "42 cm" or "16 in". */
export function fmtSnow(cm: number | null | undefined, u: Units): string {
  return cm == null ? '–' : `${fmtSnowNum(cm, u)} ${snowUnit(u)}`
}

/** A low–high range, e.g. "12–40 cm". */
export function fmtSnowRange(lo: number | null, hi: number | null, u: Units): string {
  if (lo == null || hi == null) return '–'
  return `${fmtSnowNum(lo, u)}–${fmtSnowNum(hi, u)} ${snowUnit(u)}`
}

export function elevValue(m: number, u: Units): number {
  return u === 'metric' ? m : m * FT_PER_M
}

/** Elevation as a bare number with thousands separators. */
export function fmtElevNum(m: number, u: Units): string {
  return Math.round(elevValue(m, u)).toLocaleString('en-US')
}

export function fmtElev(m: number, u: Units): string {
  return `${fmtElevNum(m, u)} ${elevUnit(u)}`
}

export function tempValue(c: number, u: Units): number {
  return u === 'metric' ? c : (c * 9) / 5 + 32
}

export function fmtTemp(c: number | null | undefined, u: Units): string {
  return c == null ? '–' : `${Math.round(tempValue(c, u))}°${u === 'metric' ? 'C' : 'F'}`
}
