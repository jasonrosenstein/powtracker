// Probe: SNOTEL through the NRCS Report Generator (one CSV for every station), which runs
// separately from the AWDB REST API.
const cols = 'stationId,state.code,name,latitude,longitude,elevation,SNWD::value,WTEQ::value'
const url =
  'https://wcc.sc.egov.usda.gov/reportGenerator/view_csv/customMultipleStationReport/daily/start_of_period/' +
  `${encodeURIComponent('network:"SNTL" AND element:"SNWD" AND outServiceDate:"2100-01-01"|name')}/-3,0/${cols}?fitToScreen=false`
console.log(url)
const res = await fetch(url, { signal: AbortSignal.timeout(90000) })
const text = await res.text()
console.log('HTTP', res.status, res.headers.get('content-type'), text.length, 'bytes')
const lines = text.split('\n')
const data = lines.filter((l) => l && !l.startsWith('#'))
console.log('comment lines', lines.length - data.length, 'data lines', data.length)
console.log(data.slice(0, 6).join('\n'))
console.log('...')
console.log(data.slice(-3).join('\n'))
