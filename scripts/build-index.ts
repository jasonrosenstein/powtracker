// Writes a greppable TSV of every named, operating downhill ski area in OpenSkiMap.
// Used when curating pass rosters (data/passes/*.json): look a resort up here to get its id.
// Usage: node scripts/build-index.ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { loadSkiAreas } from './lib/openskimap.ts'

const areas = loadSkiAreas().sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name))
const header = ['id', 'name', 'country', 'region', 'locality', 'lat', 'lon', 'base_m', 'top_m', 'vert_m', 'run_km', 'lifts', 'website']
const rows = areas.map((a) =>
  [a.osmId, a.name, a.country, a.region, a.locality, a.lat.toFixed(4), a.lon.toFixed(4), a.base, a.top, a.vert, a.runKm, a.lifts, a.website]
    .map((v) => String(v).replace(/[\t\n]/g, ' '))
    .join('\t'),
)
mkdirSync('data/build', { recursive: true })
writeFileSync('data/build/skiareas-index.tsv', [header.join('\t'), ...rows].join('\n') + '\n')
console.log(`wrote data/build/skiareas-index.tsv: ${rows.length} ski areas`)

const big = [...areas].sort((a, b) => b.vert - a.vert).slice(0, 12)
console.log('largest vertical:', big.map((a) => `${a.name} (${a.cc}) ${a.vert}m`).join(' | '))
