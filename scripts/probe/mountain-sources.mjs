// Probe: sources for trail maps and live mountain status.
// Usage: node scripts/probe/mountain-sources.mjs [name ...]
const want = process.argv.slice(2)
const UA = { 'user-agent': 'snow-tracker-probe' }
const head = async (url) => {
  const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(30_000), headers: UA })
  return `${r.status} ${Math.round(Number(r.headers.get('content-length') ?? 0) / 1e6)} MB cors=${r.headers.get('access-control-allow-origin')} modified=${r.headers.get('last-modified')}`
}
const get = async (url, opts = {}) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(45_000), headers: { ...UA, ...(opts.headers ?? {}) } })
  const text = await r.text()
  return { status: r.status, cors: r.headers.get('access-control-allow-origin'), type: r.headers.get('content-type'), text }
}
const show = (v, n = 500) => (typeof v === 'string' ? v : JSON.stringify(v)).slice(0, n)

const sources = {
  async openskimap() {
    for (const f of ['runs.geojson', 'lifts.geojson', 'ski_areas.geojson']) console.log('  ', f, await head(`https://tiles.openskimap.org/geojson/${f}`))
  },
  async liftie() {
    for (const id of ['alta', 'palisades', 'jackson-hole']) {
      const r = await get(`https://liftie.info/api/resort/${id}`, { headers: { origin: 'https://example.org' } })
      console.log('  ', id, r.status, 'cors', r.cors, r.type, show(r.text, 420))
    }
    const meta = await get('https://liftie.info/api/meta')
    console.log('  meta', meta.status, show(meta.text, 300))
  },
  async mtnpowder() {
    const r = await get('https://www.mtnpowder.com/feed?resortId=6', { headers: { origin: 'https://example.org' } })
    console.log('  ', r.status, 'cors', r.cors, r.type, r.text.length, show(r.text, 300))
    try {
      const j = JSON.parse(r.text)
      console.log('   keys', Object.keys(j).join(','))
      const area = j.MountainAreas?.[0]
      console.log('   name', j.Name, '| areas', j.MountainAreas?.length, '| trail sample', show(area?.Trails?.[0], 420), '| lift sample', show(area?.Lifts?.[0], 300))
      console.log('   snow', show(j.SnowReport, 500))
    } catch (e) {
      console.log('   not JSON', String(e).slice(0, 80))
    }
  },
  async odh() {
    const r = await get('https://tourism.api.opendatahub.com/v1/SkiArea?pagesize=3&removenullvalues=true')
    console.log('  skiarea', r.status, 'cors', r.cors, show(r.text, 500))
    const p = await get('https://tourism.api.opendatahub.com/v1/ODHActivityPoi?type=8&pagesize=2&removenullvalues=true&fields=Id,Shortname,IsOpen,Type,SubType,GpsInfo,AreaId,Difficulty,AltitudeDifference,DistanceLength')
    console.log('  slopes/lifts', p.status, show(p.text, 700))
  },
  async avalanche() {
    const us = await get('https://api.avalanche.org/v2/public/products/map-layer', { headers: { origin: 'https://example.org' } })
    console.log('  US', us.status, 'cors', us.cors, us.text.length)
    try {
      const j = JSON.parse(us.text)
      console.log('   zones', j.features?.length, show(j.features?.[0]?.properties, 500))
    } catch {}
    const ca = await get('https://api.avalanche.ca/forecasts/en/products/point?lat=50.06&long=-122.95', { headers: { origin: 'https://example.org' } })
    console.log('  CA', ca.status, 'cors', ca.cors, show(ca.text, 400))
  },
  async dem() {
    const r = await fetch('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/10/170/390.png', { headers: { origin: 'https://example.org' } })
    console.log('  terrarium tile', r.status, r.headers.get('content-type'), 'cors', r.headers.get('access-control-allow-origin'))
  },
}

for (const [name, fn] of Object.entries(sources)) {
  if (want.length && !want.includes(name)) continue
  console.log(`\n== ${name}`)
  try {
    await fn()
  } catch (e) {
    console.log('  FAILED', String(e.message ?? e).slice(0, 220))
  }
}
