// Builds public/data/openings.json: each mountain's announced season opening, from the research
// files in data/openings/*.json. Every entry there names the page that states it.
//
// Announcements move with the weather: re-collect them through the early season, and note the
// "compiled" date, which the app shows beside each one.
//
// Usage: node scripts/build-openings.ts
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { Opening, OpeningsFile, ResortsFile } from '../src/lib/types.ts'

interface Research {
  season: string
  compiled: string
  /** Whether each `says` is quoted word for word from its page; an entry can say otherwise. */
  verbatim?: boolean
  openings: { id: string; name: string; state: string; date?: string; says?: string; source?: string; verbatim?: boolean }[]
}

/**
 * Ski guides whose season dates are their own listing, not the resort's statement. Checked
 * against operators' pages on 2026-11-17, Skiresort.com's date matched 163 times in 223.
 */
const GUIDES: [RegExp, string][] = [[/(^|\.)skiresort\.(com|info|de)$/, 'Skiresort.com']]

const DIR = 'data/openings'
const STATES = new Set(['open', 'planned', 'tentative', 'tba', 'closed'])
/** A quote short enough for a card, cut between words. */
const clip = (s: string, max = 220) => (s.length <= max ? s : `${s.slice(0, s.lastIndexOf(' ', max - 1))}…`)
const resorts = new Map((JSON.parse(readFileSync('public/data/resorts.json', 'utf8')) as ResortsFile).resorts.map((r) => [r.id, r]))
const out: OpeningsFile = { season: '', compiled: '', resorts: {} }
const problems: string[] = []
const conflicts: string[] = []
/** How definite a statement is: a season called off, open, a set date, a hoped-for date, wording only, no date. */
const strength = (o: Opening) => (o.s === 'closed' ? 6 : o.s === 'open' ? (o.d ? 5 : 4) : o.s === 'planned' && o.d ? 3 : o.s === 'tentative' && o.d ? 2 : o.s === 'tba' ? 0 : 1)

for (const file of existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.json')) : []) {
  const research = JSON.parse(readFileSync(`${DIR}/${file}`, 'utf8')) as Research
  out.season ||= research.season
  // The oldest collection date is the honest one to show.
  if (!out.compiled || research.compiled < out.compiled) out.compiled = research.compiled
  let kept = 0
  for (const o of research.openings) {
    if (!resorts.has(o.id)) {
      problems.push(`${file}: ${o.name} has id ${o.id}, which is not a tracked mountain`)
      continue
    }
    // "unknown" in the research means the source says no date is set; that is worth showing in
    // the resort's words, and nothing without them.
    const state = o.state === 'unknown' ? 'tba' : o.state
    if (!STATES.has(state) || (state === 'tba' && !o.says?.trim())) continue
    if (!o.source || !/^https?:\/\//.test(o.source)) {
      problems.push(`${file}: ${o.name} has no source page`)
      continue
    }
    if (o.date && (!/^\d{4}-\d{2}-\d{2}$/.test(o.date) || Number.isNaN(Date.parse(o.date)) || o.date < '2026-09-01' || o.date > '2027-03-31')) {
      problems.push(`${file}: ${o.name} has an implausible date ${o.date}`)
      continue
    }
    const entry: Opening = { s: state as Opening['s'], says: clip((o.says ?? '').replace(/\s+/g, ' ').trim()), src: o.source }
    if (o.date && state !== 'tba' && state !== 'closed') entry.d = o.date
    if (/^\d{4}-\d{2}-\d{2}$/.test(research.compiled ?? '')) entry.at = research.compiled
    if (entry.says && (o.verbatim ?? research.verbatim)) entry.q = 1
    const guide = GUIDES.find(([host]) => host.test(new URL(entry.src).hostname))
    if (guide) entry.via = guide[1]
    // Two files can cover one mountain. The more definite statement wins; two equally definite
    // ones that disagree are reported, and the first is kept until someone reads both pages.
    const prior = out.resorts[o.id]
    if (prior && strength(prior) >= strength(entry)) {
      if (strength(prior) === strength(entry) && prior.d !== entry.d) conflicts.push(`${o.name} (${o.id}): kept ${prior.d} from ${prior.src}, not ${entry.d} from ${entry.src}`)
      continue
    }
    out.resorts[o.id] = entry
    kept++
  }
  console.log(`${file}: ${kept} of ${research.openings.length} entries kept`)
}

for (const p of problems) console.warn(`  skipped ${p}`)
for (const c of conflicts) console.warn(`  disagreement ${c}`)
writeFileSync('public/data/openings.json', JSON.stringify(out))
const states = Object.values(out.resorts).reduce<Record<string, number>>((m, o) => ((m[o.s] = (m[o.s] ?? 0) + 1), m), {})
console.log(`wrote public/data/openings.json: ${Object.keys(out.resorts).length} mountains ${JSON.stringify(states)}, collected ${out.compiled || 'never'}`)
