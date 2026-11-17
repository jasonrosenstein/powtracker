// Refreshes public/data/forecast.json: for every resort, pulls the hourly forecast from each
// weather model, computes snowfall at base, mid and summit, and stores the 3 / 7 / 14 day totals
// with the spread between models.
//
// Usage: node scripts/ingest.ts [--resume] [--limit N] [--only id,id] [--out file]
//   --resume  keep the raw model output already in data/raw/openmeteo/ and fetch only the
//             resorts that are missing from it. The snapshot time stays that of the cached run.
//             Use it after adding resorts, after an interrupted run, or to recompute the
//             snapshot after changing the snow engine without spending any API calls.
// Env:   OPEN_METEO_API_KEY  optional; switches to the commercial endpoint and drops the pacing.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import https from 'node:https'
import { parseArgs } from 'node:util'
import { gunzipSync } from 'node:zlib'
import { parseHourly, summarise, type OpenMeteoLocation } from '../src/lib/forecast.ts'
import { FORECAST_DAYS, MODEL_IDS, PAST_DAYS, WINDOWS_H } from '../src/lib/models.ts'
import { callWeight, forecastUrl, REQUEST_FORECAST_DAYS } from '../src/lib/openmeteo.ts'
import type { ForecastFile, Resort, ResortsFile } from '../src/lib/types.ts'

const { values: args } = parseArgs({
  options: {
    resume: { type: 'boolean', default: false },
    limit: { type: 'string' },
    only: { type: 'string' },
    out: { type: 'string', default: 'public/data/forecast.json' },
    resorts: { type: 'string', default: 'public/data/resorts.json' },
    cache: { type: 'string', default: 'data/raw/openmeteo' },
  },
})

const apiKey = process.env.OPEN_METEO_API_KEY || undefined
const BATCH = 25
// Free tier: 600 calls a minute, 5,000 an hour, 10,000 a day, counted by weight. Stay well under
// the minute limit so a second process on the same address does not tip it over.
const BUDGET_PER_MIN = 450
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let resorts: Resort[] = (JSON.parse(readFileSync(args.resorts, 'utf8')) as ResortsFile).resorts
if (args.only) {
  const ids = new Set(args.only.split(','))
  resorts = resorts.filter((r) => ids.has(r.id))
}
if (args.limit) resorts = resorts.slice(0, Number(args.limit))
if (resorts.length === 0) throw new Error('no resorts to ingest')

// The raw cache: one file of model output per resort, and the time the run started.
const metaFile = `${args.cache}/run.json`
const rawFile = (id: string) => `${args.cache}/${id}.json`
let startedMs = Date.now()
if (args.resume && existsSync(metaFile)) {
  const meta = JSON.parse(readFileSync(metaFile, 'utf8')) as { generated: string; models: string[] }
  // A cached run with extra models is still usable: only the listed ones are read from it.
  const missing = MODEL_IDS.filter((m) => !meta.models.includes(m))
  if (missing.length) throw new Error(`the cached run lacks ${missing.join(', ')}: run without --resume`)
  startedMs = Date.parse(meta.generated)
} else {
  rmSync(args.cache, { recursive: true, force: true })
  mkdirSync(args.cache, { recursive: true })
  writeFileSync(metaFile, JSON.stringify({ generated: new Date(startedMs).toISOString(), models: MODEL_IDS }))
}

const todo = resorts.filter((r) => !existsSync(rawFile(r.id)))
const days = PAST_DAYS + REQUEST_FORECAST_DAYS
const perResort = callWeight(1, 2, MODEL_IDS.length, days)
console.log(
  `${resorts.length} resorts x ${MODEL_IDS.length} models; fetching ${todo.length}` +
    ` (${resorts.length - todo.length} cached) at weight ${perResort.toFixed(2)} each, ` +
    `${Math.round(perResort * todo.length)} calls` +
    (apiKey ? ' (commercial endpoint)' : ' (free tier, paced)'),
)

// One connection, held open for the whole run. The pacing leaves about seven seconds between
// requests, longer than fetch() keeps an idle connection, so fetch() opened a new one each time.
// From a GitHub runner that failed: after two new connections in a minute the next ones timed
// out for the rest of it (2026-11-17: 38 timeouts, 13 minutes of waiting, in one refresh).
const agent = new https.Agent({ keepAlive: true, maxSockets: 1 })

function get(url: string, timeoutMs = 120_000): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { agent, headers: { 'accept-encoding': 'gzip' }, timeout: timeoutMs }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('error', reject)
      res.on('end', () => {
        const body = Buffer.concat(chunks)
        try {
          resolve({ status: res.statusCode ?? 0, text: (res.headers['content-encoding'] === 'gzip' ? gunzipSync(body) : body).toString('utf8') })
        } catch (e) {
          reject(e)
        }
      })
    })
    req.on('timeout', () => req.destroy(new Error(`no response in ${timeoutMs / 1000}s`)))
    req.on('error', reject)
  })
}

async function fetchBatch(batch: Resort[]): Promise<OpenMeteoLocation[]> {
  const url = forecastUrl(
    batch.map((r) => ({ lat: r.la, lon: r.lo, elevation: (r.b + r.t) / 2 })),
    { apiKey },
  )
  let lastError = ''
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await get(url)
      if (res.status >= 200 && res.status < 300) {
        const body = JSON.parse(res.text) as OpenMeteoLocation | OpenMeteoLocation[]
        const locs = Array.isArray(body) ? body : [body]
        if (locs.length !== batch.length) throw new Error(`asked for ${batch.length} locations, got ${locs.length}`)
        return locs
      }
      lastError = `HTTP ${res.status}: ${res.text.slice(0, 200)}`
      // 429 is the rate limit: wait out the minute. Other 4xx will not fix themselves.
      if (res.status !== 429 && res.status < 500) break
    } catch (e) {
      // Name the network fault (ETIMEDOUT, ECONNRESET, …): "failed" alone cannot be diagnosed.
      const code = (e as NodeJS.ErrnoException).code
      lastError = code ? `${code}: ${String(e)}` : String(e)
    }
    const wait = Math.min(120, 15 * attempt)
    console.warn(`  attempt ${attempt} failed (${lastError}); retrying in ${wait}s`)
    await sleep(wait * 1000)
  }
  throw new Error(`Open-Meteo request failed: ${lastError}`)
}

const t0 = Date.now()
for (let i = 0; i < todo.length; i += BATCH) {
  const batch = todo.slice(i, i + BATCH)
  const batchStart = Date.now()
  const locs = await fetchBatch(batch)
  batch.forEach((r, k) => writeFileSync(rawFile(r.id), JSON.stringify(locs[k])))
  const done = Math.min(i + BATCH, todo.length)
  console.log(`  fetched ${done}/${todo.length}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`)
  if (!apiKey && done < todo.length) {
    const minGapMs = ((perResort * batch.length) / BUDGET_PER_MIN) * 60_000
    await sleep(Math.max(0, minGapMs - (Date.now() - batchStart)))
  }
}
agent.destroy()

const out: ForecastFile = {
  generated: new Date(startedMs).toISOString(),
  models: [...MODEL_IDS],
  windowsH: [...WINDOWS_H],
  days: FORECAST_DAYS,
  resorts: {},
}
for (const r of resorts) {
  const loc = JSON.parse(readFileSync(rawFile(r.id), 'utf8')) as OpenMeteoLocation
  out.resorts[r.id] = summarise(parseHourly(loc), r.b, r.t, startedMs)
}

// A snapshot where almost nothing has a forecast means the parsing broke, not that winter is over.
const withData = Object.values(out.resorts).filter((f) => f.n[0] > 0).length
if (withData < resorts.length * 0.9) {
  throw new Error(`only ${withData} of ${resorts.length} resorts have a 3-day forecast; not writing ${args.out}`)
}

const tmp = `${args.out}.tmp`
writeFileSync(tmp, JSON.stringify(out))
renameSync(tmp, args.out)

const top = resorts
  .map((r) => ({ r, v: out.resorts[r.id].w[1][1] ?? -1 }))
  .sort((a, b) => b.v - a.v)
  .slice(0, 10)
console.log(`wrote ${args.out}: ${resorts.length} resorts, ${withData} with data, snapshot ${out.generated}`)
console.log('deepest 7-day forecast at mid elevation:')
for (const { r, v } of top) console.log(`  ${v.toFixed(0).padStart(4)} cm  ${r.n} (${r.cc})`)
