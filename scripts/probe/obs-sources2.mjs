// Probe, second pass: the details needed to write adapters for the feeds that answered.
const want = process.argv.slice(2)
const get = async (url, as = 'json') => {
  const r = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { 'user-agent': 'snow-tracker-probe' } })
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url.slice(0, 110)}`)
  return as === 'json' ? r.json() : r.text()
}
const show = (v, n = 420) => JSON.stringify(v).slice(0, n)

const sources = {
  // Snow depth is an hourly element: look at the map for the top of the hour.
  async jma() {
    const t = (await get('https://www.jma.go.jp/bosai/amedas/data/latest_time.txt', 'text')).trim()
    const stamp = t.slice(0, 13).replace(/[-T]/g, '') + '0000'
    const map = await get(`https://www.jma.go.jp/bosai/amedas/data/map/${stamp}.json`)
    const ids = Object.keys(map)
    const keys = {}
    for (const id of ids) for (const k of Object.keys(map[id])) keys[k] = (keys[k] ?? 0) + 1
    console.log('  hour', stamp, 'stations', ids.length, 'fields', show(keys, 500))
    const snowy = ids.filter((id) => map[id].snow)
    console.log('  with snow', snowy.length, show(snowy.slice(0, 3).map((id) => ({ id, ...map[id] })), 700))
  },
  async iem() {
    const nets = await get('https://mesonet.agron.iastate.edu/api/1/networks.json')
    const rows = nets.data ?? nets
    console.log('  networks', rows.length, 'snotel-like:', rows.filter((n) => /snotel|scan|snow/i.test(n.id + n.name)).map((n) => `${n.id}=${n.name}`).join(' | ').slice(0, 400))
    const day = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const d = await get(`https://mesonet.agron.iastate.edu/api/1/daily.geojson?date=${day}&network=UT_COOP`)
    const f = d.features ?? []
    console.log('  UT COOP', f.length, 'with snow', f.filter((x) => x.properties.snow != null).length, 'with depth', f.filter((x) => x.properties.snowd != null).length, show(f.find((x) => x.properties.snowd > 0) ?? f[0], 500))
    const st = await get('https://mesonet.agron.iastate.edu/geojson/network/UT_COOP.geojson')
    console.log('  station meta', st.features.length, show(st.features[0], 420))
  },
  async france() {
    for (const [name, url] of [
      ['nivo csv', `https://donneespubliques.meteofrance.fr/donnees_libres/Txt/Nivo/nivo.${new Date(Date.now() - 86400000).toISOString().slice(0, 10).replace(/-/g, '')}06.csv`],
      ['quot dataset', 'https://www.data.gouv.fr/api/1/datasets/donnees-climatologiques-de-base-quotidiennes/'],
    ]) {
      try {
        const t = await get(url, 'text')
        if (name === 'quot dataset') {
          const j = JSON.parse(t)
          const res = j.resources.filter((r) => /Q_73_/.test(r.url))
          console.log('  dataset resources', j.resources.length, 'Savoie:', res.map((r) => r.url).join(' | ').slice(0, 600))
        } else console.log('  OK', name, t.length, t.slice(0, 300).replace(/\s+/g, ' '))
      } catch (e) {
        console.log('  FAIL', name, String(e.message).slice(0, 130))
      }
    }
  },
  async bc() {
    const url = 'https://openmaps.gov.bc.ca/geo/pub/WHSE_WATER_MANAGEMENT.SSL_SNOW_ASWS_STNS_SP/ows?service=WFS&version=2.0.0&request=GetFeature&typeName=pub:WHSE_WATER_MANAGEMENT.SSL_SNOW_ASWS_STNS_SP&outputFormat=json&srsName=EPSG:4326'
    const g = await get(url)
    console.log('  stations', g.features.length, show(g.features[0], 700))
  },
  async eccc() {
    const g = await get('https://api.weather.gc.ca/collections/swob-realtime/items?f=json&limit=3&sortby=-date_tm-value')
    const p = g.features?.[0]?.properties ?? {}
    console.log('  matched', g.numberMatched, 'snow keys', Object.keys(p).filter((k) => /snw|snow/i.test(k)).join(', ').slice(0, 300))
    console.log('  sample', show(Object.fromEntries(Object.entries(p).filter(([k]) => /stn_nam|date_tm|snw_dpth-value|stn_elev|lat|long|wmo|msc_id|pcpn_amt_pst24hrs-value|snwfl/i.test(k))), 500))
  },
  async awdb() {
    for (const url of ['https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/stations?stationTriplets=766:UT:SNTL', 'https://wcc.sc.egov.usda.gov/', 'https://www.nrcs.usda.gov/wps/portal/wcc/home/']) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: 'manual' })
        console.log('  ', r.status, url.slice(0, 70), r.headers.get('location') ?? '')
      } catch (e) {
        console.log('  ERR', url.slice(0, 60), String(e.cause ?? e).slice(0, 80))
      }
    }
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
