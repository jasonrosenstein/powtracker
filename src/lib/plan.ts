// What is free and what is Powtracker Pro.
//
// The split was chosen by comparing four designs (scripts/pricing-scenarios.ts): the free app
// answers "is it snowing soon?" for every mountain, which is worth opening every day and worth
// sharing; Pro answers "where and when should I go?", which is what a skier plans a trip on.
//
//   Free: every mountain, the next 3 days and the last 24 hours at mid elevation, the trail map,
//         live lifts and trails, the opening date, avalanche danger, one saved mountain.
//   Pro:  the 7- and 14-day outlook, the last 72 hours, base and summit forecasts, season-pass
//         filters, the model-by-model view, ranking by snow depth, map animations, the
//         hour-by-hour summit weather, and any number of saved mountains.
//
// Safety information (avalanche danger) and what a resort itself publishes (opening dates, live
// lifts) stay free on purpose.
import type { Metric, SortKey } from './data.ts'
import type { Level } from './models.ts'

export type Plan = 'free' | 'pro'

/** A thing only Pro unlocks; each has its own line on the paywall. */
export type Feature = 'outlook' | 'levels' | 'passes' | 'models' | 'depth' | 'layers' | 'hours' | 'saved'

/** Days of forecast the free plan shows, counting today. */
export const FREE_DAYS = 3
/** Mountains the free plan can keep under Saved. */
export const FREE_SAVED = 1
export const TRIAL_DAYS = 7
/** Shown until the App Store reports the price in the buyer's own currency. */
export const LIST_PRICE = '$2.99'
/** The subscription's identifier in App Store Connect. */
export const PRODUCT_ID = 'app.powtracker.pro.monthly'

const FREE_METRICS: readonly Metric[] = ['p24', 'w3']
const PRO_SORTS: Partial<Record<SortKey, Feature>> = { depth: 'depth', agree: 'models' }

/** The feature a choice needs, or null when the plan already allows it. */
export const metricNeeds = (plan: Plan, metric: Metric): Feature | null => (plan === 'pro' || FREE_METRICS.includes(metric) ? null : 'outlook')
export const levelNeeds = (plan: Plan, level: Level): Feature | null => (plan === 'pro' || level === 'mid' ? null : 'levels')
export const sortNeeds = (plan: Plan, key: SortKey): Feature | null => (plan === 'pro' ? null : (PRO_SORTS[key] ?? null))
export const passesNeed = (plan: Plan, passes: readonly string[]): Feature | null => (plan === 'pro' || passes.length === 0 ? null : 'passes')
/** Saving one more mountain when `count` are already saved. */
export const savingNeeds = (plan: Plan, count: number): Feature | null => (plan === 'pro' || count < FREE_SAVED ? null : 'saved')

/** The choices to fall back to when a remembered one is no longer allowed (a lapsed subscription). */
export const allowedMetric = (plan: Plan, metric: Metric): Metric => (metricNeeds(plan, metric) ? 'w3' : metric)
export const allowedLevel = (plan: Plan, level: Level): Level => (levelNeeds(plan, level) ? 'mid' : level)
export const allowedSort = <S extends { key: SortKey; desc: boolean }>(plan: Plan, sort: S): S | { key: SortKey; desc: boolean } => (sortNeeds(plan, sort.key) ? { key: 'snow', desc: true } : sort)

/** What the paywall says first, by what the person was reaching for. */
export const FEATURE_PITCH: Record<Feature, { title: string; body: string }> = {
  outlook: { title: 'See the next 7 and 14 days', body: 'The free forecast stops at 3 days. Pro shows where the storms land over the next two weeks, day by day, for every mountain.' },
  levels: { title: 'Base and summit forecasts', body: 'Snow at the top is not snow at the bottom. Pro works out every forecast for the base, the middle and the summit, and shows where the snow line sits.' },
  passes: { title: 'Filter by your season pass', body: 'See only the mountains your Ikon, Epic, Indy, Mountain Collective, Power or Magic pass covers, ranked by the snow on the way.' },
  models: { title: 'Every weather model, side by side', body: 'See what each of the eight models says, how far apart they are, and rank mountains by how well they agree.' },
  depth: { title: 'Rank by snow on the ground', body: 'Sort every mountain by the depth measured at official snow stations.' },
  layers: { title: 'Animated weather maps', body: 'Play the forecast across the map: snowfall, temperature and wind from the weather models, hour by hour, and the day-by-day totals for every mountain.' },
  hours: { title: 'Summit weather, hour by hour', body: 'Temperature, sky and gusts at the summit for the next day and a half, so you know when the lifts are likely to hold.' },
  saved: { title: 'Save every mountain you ski', body: `The free plan keeps ${FREE_SAVED} saved mountain. Pro keeps as many as you like, ranked together.` },
}

/** Everything Pro adds, for the list on the paywall. */
export const PRO_BENEFITS: readonly string[] = [
  '7- and 14-day snowfall outlook for 1,750 mountains',
  'Base, mid and summit forecasts, and the snow line',
  'Filter by Ikon, Epic, Indy and other passes',
  'All eight weather models, and how far they agree',
  'Animated forecast maps and hour-by-hour summit weather',
  'Unlimited saved mountains',
]
