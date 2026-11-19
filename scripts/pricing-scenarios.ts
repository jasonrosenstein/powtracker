// Compares ways to split Powtracker into free and paid, at $2.99 a month with a 7-day trial.
//
// The conversion and retention figures are published medians from other apps, not measurements
// of this one (it has no subscribers yet). Each scenario's own rate is an assumption placed
// between those medians, with a low and a high case. Read the output as "which design wins, and
// what would have to be true for another to win", not as a forecast of income.
//
// Benchmarks (RevenueCat, State of Subscription Apps 2026, and its free-trial-length study):
//   download → paying by day 35, median:   hard paywall 10.7 %   freemium 2.1 %
//   trial → paid, monthly plan, 5–9 day trial:           45.9 %
//   first renewal after such a trial:                    62.8 %
//   monthly plans still paying after 12 months:          about 9 %
//
// Usage: node scripts/pricing-scenarios.ts

const PRICE = 2.99
const APPLE_CUT = 0.15 // App Store Small Business Program; 0.30 without it
// Monthly fixed costs once the app charges money: Open-Meteo's commercial plan (about €29),
// the Apple developer membership ($99 a year) and the domain ($15 a year).
const FIXED_PER_MONTH = 31 + 99 / 12 + 15 / 12

/** Paid months in the first year for one person who starts paying. */
function paidMonthsYearOne(firstRenewal = 0.628, stillPayingAt12 = 0.09): number {
  // Month 1 is paid; month 2 at the first-renewal rate; then a steady decline to the 12-month figure.
  const decline = (stillPayingAt12 / firstRenewal) ** (1 / 10)
  let months = 1
  let share = firstRenewal
  for (let m = 2; m <= 12; m++) {
    months += share
    share *= decline
  }
  return months
}

interface Scenario {
  name: string
  what: string
  /** Share of installs paying by day 35: low, expected, high. */
  paying: [number, number, number]
  /**
   * Installs relative to scenario C for the same effort. With no advertising, installs come from
   * the website, shared links and store ratings, all of which need something free to show.
   */
  reach: [number, number, number]
}

const SCENARIOS: Scenario[] = [
  {
    name: 'A  Hard paywall',
    what: 'nothing works without starting the trial',
    paying: [0.042, 0.107, 0.16],
    reach: [0.15, 0.3, 0.6],
  },
  {
    name: 'B  Generous free',
    what: 'free: every forecast to 7 days; paid: 14 days, models, extras',
    paying: [0.01, 0.021, 0.03],
    reach: [1, 1.15, 1.3],
  },
  {
    name: 'C  Three days free',
    what: 'free: next 3 days at mid mountain, one saved; paid: 7 and 14 days, base and summit, passes, tools',
    paying: [0.03, 0.055, 0.08],
    reach: [1, 1, 1],
  },
  {
    name: 'D  One mountain free',
    what: 'free: everything for one home mountain; paid: every other mountain',
    paying: [0.008, 0.015, 0.025],
    reach: [1, 1.05, 1.2],
  },
]

const months = paidMonthsYearOne()
const netPerPayer = months * PRICE * (1 - APPLE_CUT)
console.log(`One paying subscriber: ${months.toFixed(2)} paid months in year one = $${(months * PRICE).toFixed(2)} gross, $${netPerPayer.toFixed(2)} after Apple's ${APPLE_CUT * 100} %`)
console.log(`Fixed costs once charging: about $${FIXED_PER_MONTH.toFixed(0)} a month\n`)

console.log('First-year income after Apple, per 1,000 installs that scenario C would get (low / expected / high):')
const expected: { name: string; net: number }[] = []
for (const s of SCENARIOS) {
  const net = s.paying.map((p, i) => 1000 * s.reach[i] * p * netPerPayer)
  expected.push({ name: s.name, net: net[1] })
  const payers = Math.round(1000 * s.reach[1] * s.paying[1])
  console.log(`  ${s.name.padEnd(22)} $${net.map((n) => n.toFixed(0).padStart(4)).join(' / $')}   ${String(payers).padStart(3)} payers   ${s.what}`)
}

const c = SCENARIOS[2]
const a = SCENARIOS[0]
console.log('\nWhat would have to be true for the hard paywall to win:')
console.log(`  it must keep ${((c.paying[1] / a.paying[1]) * 100).toFixed(0)} % of scenario C's installs (expected case assumes ${a.reach[1] * 100} %)`)
console.log(`  or, at the same reach, C must convert below ${(a.paying[1] * a.reach[1] * 100).toFixed(1)} % (expected ${c.paying[1] * 100} %; the freemium median is 2.1 %)`)

const breakEven = Math.ceil(FIXED_PER_MONTH / (PRICE * (1 - APPLE_CUT)))
console.log(`\nSubscribers needed to cover the fixed costs: ${breakEven} at any one time`)
console.log(`Installs a month needed for that under C: about ${Math.ceil((FIXED_PER_MONTH * 12) / (c.paying[1] * netPerPayer) / 12)}`)
