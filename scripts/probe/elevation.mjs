// Probe: does Open-Meteo's snowfall respond to the `elevation` parameter, per model?
// Usage: node scripts/probe/elevation.mjs [lat] [lon] [elev1,elev2,...]
const lat = process.argv[2] ?? '40.59'
const lon = process.argv[3] ?? '-111.64'
const elevs = (process.argv[4] ?? '1900,2700,3400').split(',')
const models = process.argv[5] ?? 'ecmwf_ifs025,gfs_seamless,icon_seamless,gem_seamless'

const url =
  `https://api.open-meteo.com/v1/forecast?latitude=${elevs.map(() => lat).join(',')}` +
  `&longitude=${elevs.map(() => lon).join(',')}&elevation=${elevs.join(',')}` +
  `&daily=snowfall_sum,precipitation_sum&forecast_days=14&timezone=auto&models=${models}`

const res = await fetch(url)
const body = await res.json()
if (!res.ok) {
  console.log(res.status, body)
  process.exit(1)
}
for (const loc of Array.isArray(body) ? body : [body]) {
  console.log(`== elevation ${loc.elevation}  (${loc.latitude}, ${loc.longitude})  tz=${loc.timezone}`)
  for (const [k, v] of Object.entries(loc.daily)) {
    if (k === 'time') {
      console.log(`  days=${v.length} ${v[0]}..${v.at(-1)}`)
      continue
    }
    const vals = v.filter((x) => x != null)
    const sum = vals.reduce((a, b) => a + b, 0)
    console.log(`  ${k.padEnd(40)} n=${String(vals.length).padStart(2)} sum=${sum.toFixed(1).padStart(7)}  ${v.map((x) => (x == null ? '-' : x)).join(' ')}`)
  }
}
