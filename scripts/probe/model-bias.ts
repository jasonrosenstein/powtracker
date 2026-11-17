// Probe: how each model's totals compare with the other models across every resort in the snapshot.
// For each window: the model's total divided by the median of the OTHER models at the same resort
// (resorts where that median is under 5 cm are skipped), summarised as quartiles, plus how often
// the model is the highest of all and how often it is more than 2.5x the next highest.
// Usage: node scripts/probe/model-bias.ts [forecast.json]
import { readFileSync } from 'node:fs'
import { MODELS, WINDOW_LABELS } from '../../src/lib/models.ts'
import type { ForecastFile } from '../../src/lib/types.ts'

const fc = JSON.parse(readFileSync(process.argv[2] ?? 'public/data/forecast.json', 'utf8')) as ForecastFile
const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
const q = (v: number[], p: number) => [...v].sort((a, b) => a - b)[Math.floor((v.length - 1) * p)]

for (let w = 0; w < 3; w++) {
  console.log(`\n${WINDOW_LABELS[w]} (mid elevation)`)
  console.log('  model              n     q25   median    q75   highest%  >2.5x next%')
  MODELS.forEach((model, mi) => {
    const ratios: number[] = []
    let highest = 0
    let isolated = 0
    let n = 0
    for (const f of Object.values(fc.resorts)) {
      const mine = f.mm[mi]?.[w]
      const others = f.mm.filter((_, i) => i !== mi).map((m) => m[w]).filter((v): v is number => v != null)
      if (mine == null || others.length < 2) continue
      const med = median(others)
      if (med < 5) continue
      n++
      ratios.push(mine / med)
      const top = Math.max(...others)
      if (mine > top) highest++
      if (mine > 2.5 * top && mine - top >= 30) isolated++
    }
    if (!n) return console.log(`  ${model.label.padEnd(16)} no coverage`)
    console.log(
      `  ${model.label.padEnd(16)} ${String(n).padStart(4)}  ${q(ratios, 0.25).toFixed(2).padStart(6)} ${median(ratios).toFixed(2).padStart(7)} ${q(ratios, 0.75).toFixed(2).padStart(7)}` +
        `   ${((100 * highest) / n).toFixed(0).padStart(5)}%   ${((100 * isolated) / n).toFixed(1).padStart(6)}%`,
    )
  })
}
