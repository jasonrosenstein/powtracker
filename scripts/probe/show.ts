// Probe: print one resort's snapshot entry in readable form.
// Usage: node scripts/probe/show.ts <name-substring> [forecast.json]
import { readFileSync } from 'node:fs'
import { MODELS } from '../../src/lib/models.ts'
import type { ForecastFile, ResortsFile } from '../../src/lib/types.ts'

const q = (process.argv[2] ?? '').toLowerCase()
const fc = JSON.parse(readFileSync(process.argv[3] ?? 'public/data/forecast.json', 'utf8')) as ForecastFile
const rs = (JSON.parse(readFileSync('public/data/resorts.json', 'utf8')) as ResortsFile).resorts
for (const r of rs.filter((x) => x.n.toLowerCase().includes(q) && fc.resorts[x.id]).slice(0, 4)) {
  const f = fc.resorts[r.id]
  console.log(`\n${r.n} (${r.cc})  base ${r.b} m, summit ${r.t} m   day 0 = ${f.d0}   temp mid next 72h ${f.t[0]}..${f.t[1]} C`)
  ;['base', 'mid ', 'top '].forEach((lv, i) =>
    console.log(
      `  ${lv}  3d ${f.w[i][0]} [${f.lo[i][0]}..${f.hi[i][0]}]   7d ${f.w[i][1]} [${f.lo[i][1]}..${f.hi[i][1]}]   14d ${f.w[i][2]} [${f.lo[i][2]}..${f.hi[i][2]}]   past 24h ${f.p[i][0]} 72h ${f.p[i][1]}`,
    ),
  )
  console.log(`  models covering: ${f.n.join(' / ')}`)
  console.log(`  daily mid: ${f.d[1].join(' ')}`)
  MODELS.forEach((m, i) => console.log(`    ${m.label.padEnd(16)} ${f.mm[i].map((v) => String(v ?? '-').padStart(6)).join(' ')}`))
}
