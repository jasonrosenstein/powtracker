// Probe: the Swiss SLF measurement API (IMIS automatic snow stations and manual observer stations).
const base = 'https://measurement-api.slf.ch/public/api'
const get = async (path) => {
  try {
    const r = await fetch(base + path, { signal: AbortSignal.timeout(40000) })
    const text = await r.text()
    console.log(r.status, path, text.length, 'bytes', r.headers.get('access-control-allow-origin'))
    return r.ok ? JSON.parse(text) : null
  } catch (e) {
    console.log('ERR', path, String(e.cause ?? e).slice(0, 120))
    return null
  }
}
const stations = await get('/imis/stations')
if (stations) {
  console.log('IMIS stations', stations.length, JSON.stringify(stations[0]))
  const types = {}
  for (const s of stations) types[s.type] = (types[s.type] ?? 0) + 1
  console.log(types)
}
const m = await get('/imis/measurements')
if (m) {
  console.log('measurements', m.length, JSON.stringify(m[0]), JSON.stringify(m.find((x) => x.HS != null)))
}
const daily = await get('/imis/measurements-daily')
if (daily) console.log('daily', daily.length, JSON.stringify(daily[0]), JSON.stringify(daily.find((x) => x.HS != null)))
const study = await get('/study-plot/stations')
if (study) console.log('study plots', study.length, JSON.stringify(study[0]))
const sm = await get('/study-plot/measurements')
if (sm) console.log('study measurements', sm.length, JSON.stringify(sm.find((x) => x.HN_1D != null) ?? sm[0]))
