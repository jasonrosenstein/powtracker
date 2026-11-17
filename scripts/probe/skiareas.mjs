// Probe: shape and size distribution of the OpenSkiMap ski_areas dataset.
import { readFileSync } from 'node:fs'
const file = process.argv[2] ?? 'data/raw/openskimap/ski_areas.geojson'
const fc = JSON.parse(readFileSync(file, 'utf8'))
const feats = fc.features
console.log('features', feats.length)
const sample = feats.find((f) => f.properties.name === 'Alta' || /Whistler/.test(f.properties.name ?? ''))
console.log(JSON.stringify(sample, null, 1).slice(0, 3500))

const count = (pred) => feats.filter(pred).length
const p = (f) => f.properties
const dh = (f) => (p(f).activities ?? []).includes('downhill')
const vert = (f) => {
  const s = p(f).statistics
  if (!s || s.maxElevation == null || s.minElevation == null) return null
  return s.maxElevation - s.minElevation
}
console.log('geom types', [...new Set(feats.map((f) => f.geometry?.type))])
console.log('status', Object.entries(Object.groupBy(feats, (f) => p(f).status ?? 'null')).map(([k, v]) => `${k}:${v.length}`).join(' '))
console.log('type', Object.entries(Object.groupBy(feats, (f) => p(f).type ?? 'null')).map(([k, v]) => `${k}:${v.length}`).join(' '))
console.log('downhill', count(dh), 'downhill+operating', count((f) => dh(f) && p(f).status === 'operating'))
const ok = feats.filter((f) => dh(f) && p(f).status === 'operating' && p(f).name)
console.log('named operating downhill', ok.length, 'with vert', ok.filter((f) => vert(f) != null).length)
for (const t of [100, 200, 300, 400, 500, 700, 1000]) console.log(`  vert>=${t}m`, ok.filter((f) => (vert(f) ?? 0) >= t).length)
const byCountry = Object.groupBy(ok.filter((f) => (vert(f) ?? 0) >= 300), (f) => p(f).places?.[0]?.localized?.en?.country ?? p(f).location?.localized?.en?.country ?? '?')
console.log(Object.entries(byCountry).map(([k, v]) => [k, v.length]).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, n]) => `${k}:${n}`).join(' '))
console.log('keys', [...new Set(feats.flatMap((f) => Object.keys(p(f))))])
