// These are observations published by the named source, never weather model output.
export const reportLabels = {
  day: 'New snow · last 24 hours', today: 'New snow · report day', overnight: 'New snow · overnight', closed: 'Snow since lifts closed',
  halfDay: 'New snow · last 12 hours', twoDays: 'New snow · last 48 hours', threeDays: 'New snow · last 72 hours',
  week: 'New snow · last 7 days', storm: 'Storm snow total', recent: 'New snow · period not stated',
  depth: 'Snow depth', season: 'Season snowfall', total: 'Total snowfall · period not stated', rainToday: 'Rain gauge · since local midnight',
} as const
export type ReportMetric = keyof typeof reportLabels
// Snow in cm; liquid rain in mm. Keep the operator’s inches as well if published: the two
// editions of a snow report can be rounded independently and need not convert exactly.
export type Amount = { metric?: number; inches?: number }
export type Reading = { place: string; at: string | null; values: Partial<Record<ReportMetric, Amount>>; snowDate?: string; zone?: string; sky?: string; surface?: string }
export type PublishedReport = {
  kind: 'operator' | 'station'; source: string; url: string; checked: string
  surface?: string; readings: Reading[]
}
export type ReportFile = { version: 1; generated: string; resorts: Record<string, PublishedReport[]> }

export function showAmount(k: ReportMetric, a: Amount, units: 'metric' | 'imperial') {
  const rain = k === 'rainToday', scale = rain ? 25.4 : 2.54
  const n = units === 'metric' ? a.metric ?? a.inches! * scale : a.inches ?? a.metric! / scale
  const digits = units === 'imperial' && rain ? 2 : 1
  const value = n > 0 && n < 10 ** -digits ? `<${10 ** -digits}` : Number(n.toFixed(digits)).toString()
  return `${value} ${units === 'imperial' ? 'in' : rain ? 'mm' : 'cm'}`
}

export function reportAge(at: string | null, now = Date.now()) {
  const age = at ? now - Date.parse(at) : NaN
  return !Number.isFinite(age) || age < -3600e3 ? 'unknown' : age > 36 * 3600e3 ? 'older' : 'recent'
}
