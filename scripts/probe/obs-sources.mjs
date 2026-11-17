// Probe: which official snow-measurement feeds answer, and what their records look like.
// Usage: node scripts/probe/obs-sources.mjs [name ...]
const want = process.argv.slice(2)
const get = async (url, as = 'json') => {
  const r = await fetch(url, { signal: AbortSignal.timeout(45_000), headers: { 'user-agent': 'snow-tracker-probe' } })
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url.slice(0, 90)}`)
  return as === 'json' ? r.json() : r.text()
}
const show = (v, n = 420) => JSON.stringify(v).slice(0, n)

const sources = {
  async snotel() {
    const base = 'https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1'
    const st = await get(`${base}/stations?networkCds=SNTL&elements=SNWD&activeOnly=true&returnStationElements=false`)
    console.log('  stations', st.length, show(st[0], 300))
    const end = new Date().toISOString().slice(0, 10)
    const begin = new Date(Date.now() - 4 * 86400000).toISOString().slice(0, 10)
    const d = await get(`${base}/data?stationTriplets=${st.slice(0, 3).map((s) => s.stationTriplet).join(',')}&elements=SNWD&duration=DAILY&beginDate=${begin}&endDate=${end}`)
    console.log('  data', show(d, 500))
  },
  async jma() {
    const t = (await get('https://www.jma.go.jp/bosai/amedas/data/latest_time.txt', 'text')).trim()
    console.log('  latest', t)
    const stamp = t.replace(/[-T:]/g, '').slice(0, 14)
    const map = await get(`https://www.jma.go.jp/bosai/amedas/data/map/${stamp}.json`)
    const ids = Object.keys(map)
    const snowy = ids.filter((id) => map[id].snow)
    console.log('  stations', ids.length, 'with snow field', snowy.length, show(map[snowy[0]] ?? map[ids[0]], 420))
    const table = await get('https://www.jma.go.jp/bosai/amedas/const/amedastable.json')
    console.log('  table', Object.keys(table).length, show(table[snowy[0] ?? ids[0]], 260))
  },
  async albina() {
    const g = await get('https://static.avalanche.report/weather_stations/stations.geojson')
    const f = g.features
    const ops = {}
    for (const x of f) ops[x.properties.operator ?? '?'] = (ops[x.properties.operator ?? '?'] ?? 0) + 1
    console.log('  stations', f.length, 'with HS', f.filter((x) => x.properties.HS != null).length, 'with HSD24', f.filter((x) => x.properties.HSD24 != null).length)
    console.log('  operators', show(ops, 600))
    console.log('  sample', show(f.find((x) => x.properties.HS != null), 620))
  },
  async geosphere() {
    const meta = await get('https://dataset.api.hub.geosphere.at/v1/station/current/tawes-v1-10min/metadata')
    console.log('  stations', meta.stations.length, 'params', meta.parameters.filter((p) => /schnee|snow/i.test(p.long_name + p.name + (p.desc ?? ''))).map((p) => `${p.name}:${p.long_name}`).join(' | '))
    console.log('  station sample', show(meta.stations[0], 300))
    const ids = meta.stations.filter((s) => s.altitude > 1200).slice(0, 5).map((s) => s.id)
    const d = await get(`https://dataset.api.hub.geosphere.at/v1/station/current/tawes-v1-10min?parameters=SCHNEE&station_ids=${ids.join(',')}`)
    console.log('  data', show(d, 600))
  },
  async nivo() {
    for (const url of [
      'https://donneespubliques.meteofrance.fr/donnees_libres/Txt/Nivo/postesNivo.json',
      'https://meteo.data.gouv.fr/datasets/donnees-nivo-meteorologiques/',
      'https://www.data.gouv.fr/api/1/datasets/?q=nivo%20meteo%20france&page_size=5',
    ]) {
      try {
        const t = await get(url, 'text')
        console.log('  OK', url.slice(0, 80), t.length, t.slice(0, 260).replace(/\s+/g, ' '))
      } catch (e) {
        console.log('  FAIL', String(e.message).slice(0, 110))
      }
    }
  },
  async bc() {
    const t = await get('https://www.env.gov.bc.ca/wsd/data_searches/snow/asws/data/SD.csv', 'text')
    const lines = t.split('\n')
    console.log('  lines', lines.length, 'cols', lines[0].split(',').length, '| head', lines[0].slice(0, 200), '| last', lines.at(-2)?.slice(0, 160))
  },
  async smhi() {
    const d = await get('https://opendata-download-metobs.smhi.se/api/version/1.0/parameter/8/station-set/all/period/latest-day/data.json')
    const st = d.station ?? []
    console.log('  stations', st.length, show(st.find((s) => s.value?.length), 420))
  },
  async iem() {
    const day = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const d = await get(`https://mesonet.agron.iastate.edu/api/1/daily.geojson?date=${day}&network=VT_COOP`)
    console.log('  VT COOP', d.features?.length, show(d.features?.find((f) => f.properties.snow != null)?.properties ?? d.features?.[0]?.properties, 420))
  },
}

for (const [name, fn] of Object.entries(sources)) {
  if (want.length && !want.includes(name)) continue
  console.log(`\n== ${name}`)
  try {
    await fn()
  } catch (e) {
    console.log('  FAILED', String(e.message ?? e).slice(0, 200))
  }
}
