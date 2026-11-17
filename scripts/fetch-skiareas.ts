// Downloads the OpenSkiMap ski-areas dataset into data/raw/openskimap/ (not committed: 21 MB,
// refreshed daily upstream). Run before build-resorts.ts.
// Usage: node scripts/fetch-skiareas.ts
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { SKIAREAS_FILE, SKIAREAS_URL } from './lib/openskimap.ts'

const res = await fetch(SKIAREAS_URL)
if (!res.ok) throw new Error(`${SKIAREAS_URL}: HTTP ${res.status}`)
const text = await res.text()
const features = (JSON.parse(text) as { features: unknown[] }).features.length
mkdirSync(dirname(SKIAREAS_FILE), { recursive: true })
writeFileSync(`${SKIAREAS_FILE}.tmp`, text)
renameSync(`${SKIAREAS_FILE}.tmp`, SKIAREAS_FILE)
console.log(`wrote ${SKIAREAS_FILE}: ${features} ski areas, ${(text.length / 1e6).toFixed(1)} MB`)
