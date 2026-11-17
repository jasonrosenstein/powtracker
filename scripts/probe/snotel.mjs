// Probe: the USDA NRCS AWDB REST API (SNOTEL snow stations). Station list, then recent snow depth.
const base = 'https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1'
const t0 = Date.now()
const res = await fetch(`${base}/stations?networkCds=SNTL&elements=SNWD&activeOnly=true&returnStationElements=false`)
console.log('stations HTTP', res.status, res.headers.get('content-type'), res.headers.get('access-control-allow-origin'))
const stations = await res.json()
console.log('count', stations.length, 'in', Date.now() - t0, 'ms')
console.log(JSON.stringify(stations[0]))
const byState = {}
for (const s of stations) byState[s.stateCode] = (byState[s.stateCode] ?? 0) + 1
console.log(byState)

// Recent daily snow depth for a handful of stations near Alta / Snowbird.
const near = stations.filter((s) => Math.hypot(s.latitude - 40.59, (s.longitude + 111.64) * 0.76) < 0.2)
console.log('near Alta:', near.map((s) => `${s.stationTriplet} ${s.name} ${s.elevation}ft`).join(' | '))
const end = new Date().toISOString().slice(0, 10)
const begin = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)
const url = `${base}/data?stationTriplets=${near.slice(0, 5).map((s) => s.stationTriplet).join(',')}&elements=SNWD,WTEQ&duration=DAILY&beginDate=${begin}&endDate=${end}`
const d = await (await fetch(url)).json()
console.log(JSON.stringify(d).slice(0, 1500))
