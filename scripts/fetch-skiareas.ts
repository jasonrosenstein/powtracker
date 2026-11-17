// Downloads OpenSkiMap's datasets into data/raw/openskimap/ (not committed; refreshed daily
// upstream). The ski-areas file (21 MB) feeds build-resorts.ts. With --trails it also fetches
// the runs and lifts (about 1 GB on disk) that build-trails.ts turns into trail maps.
// Usage: node scripts/fetch-skiareas.ts [--trails]
import { createWriteStream, mkdirSync, renameSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream } from 'node:stream/web'
import { SKIAREAS_FILE, SKIAREAS_URL } from './lib/openskimap.ts'

const dir = dirname(SKIAREAS_FILE)
const base = SKIAREAS_URL.slice(0, SKIAREAS_URL.lastIndexOf('/'))
const files = ['ski_areas.geojson', ...(process.argv.includes('--trails') ? ['runs.geojson', 'lifts.geojson'] : [])]

mkdirSync(dir, { recursive: true })
for (const name of files) {
  const res = await fetch(`${base}/${name}`)
  if (!res.ok || !res.body) throw new Error(`${base}/${name}: HTTP ${res.status}`)
  // Straight to disk: the runs file is too large to hold as one string.
  await pipeline(Readable.fromWeb(res.body as unknown as ReadableStream), createWriteStream(`${dir}/${name}.tmp`))
  renameSync(`${dir}/${name}.tmp`, `${dir}/${name}`)
  console.log(`wrote ${dir}/${name}: ${(statSync(`${dir}/${name}`).size / 1e6).toFixed(0)} MB`)
}
