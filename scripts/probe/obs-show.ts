// Probe: print the station measurements matched to resorts whose name contains each argument,
// and coverage by country.
// Usage: node scripts/probe/obs-show.ts alta "st. anton" ...
import { readFileSync } from 'node:fs'
import type { ObservationsFile, ResortsFile } from '../../src/lib/types.ts'

const obs = JSON.parse(readFileSync('public/data/observations.json', 'utf8')) as ObservationsFile
const resorts = (JSON.parse(readFileSync('public/data/resorts.json', 'utf8')) as ResortsFile).resorts
for (const q of process.argv.slice(2)) {
  for (const r of resorts.filter((x) => x.n.toLowerCase().includes(q.toLowerCase())).slice(0, 2)) {
    console.log(`\n${r.n} (${r.cc}) ${r.b}-${r.t} m`)
    for (const o of obs.resorts[r.id] ?? []) console.log(`  ${o.k.padEnd(9)} ${String(o.v).padStart(4)} cm  ${o.st} (${o.z} m, ${o.km} km)  ${o.at.slice(5, 16)}  ${o.src}`)
    if (!obs.resorts[r.id]) console.log('  no station matched')
  }
}
const by: Record<string, [number, number]> = {}
for (const r of resorts) {
  by[r.co] ??= [0, 0]
  by[r.co][1]++
  if (obs.resorts[r.id]) by[r.co][0]++
}
console.log('\ncoverage by country (mountains with a station / tracked):')
console.log(Object.entries(by).sort((a, b) => b[1][1] - a[1][1]).slice(0, 16).map(([c, [a, n]]) => `${c} ${a}/${n}`).join(' · '))
