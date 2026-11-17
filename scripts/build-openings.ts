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
  openings: { id: string; name: string; state: string; date?: string; says?: string; source?: string }[]
}

const DIR = 'data/openings'
const resorts = new Map((JSON.parse(readFileSync('public/data/resorts.json', 'utf8')) as ResortsFile).resorts.map((r) => [r.id, r]))
const out: OpeningsFile = { season: '', compiled: '', resorts: {} }
const problems: string[] = []

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
    if (o.state !== 'open' && o.state !== 'planned' && o.state !== 'tentative') continue
    if (!o.source || !/^https?:\/\//.test(o.source)) {
      problems.push(`${file}: ${o.name} has no source page`)
      continue
    }
    if (o.date && (!/^\d{4}-\d{2}-\d{2}$/.test(o.date) || Number.isNaN(Date.parse(o.date)) || o.date < '2026-09-01' || o.date > '2027-03-31')) {
      problems.push(`${file}: ${o.name} has an implausible date ${o.date}`)
      continue
    }
    const entry: Opening = { s: o.state, says: (o.says ?? '').trim().slice(0, 220), src: o.source }
    if (o.date) entry.d = o.date
    out.resorts[o.id] = entry
    kept++
  }
  console.log(`${file}: ${kept} of ${research.openings.length} entries kept`)
}

for (const p of problems.slice(0, 20)) console.warn(`  skipped ${p}`)
writeFileSync('public/data/openings.json', JSON.stringify(out))
const states = Object.values(out.resorts).reduce<Record<string, number>>((m, o) => ((m[o.s] = (m[o.s] ?? 0) + 1), m), {})
console.log(`wrote public/data/openings.json: ${Object.keys(out.resorts).length} mountains ${JSON.stringify(states)}, collected ${out.compiled || 'never'}`)
