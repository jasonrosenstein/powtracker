// Probe: which model domains and variables the Open-Meteo spatial files offer for map layers.
const base = 'https://openmeteo.s3.amazonaws.com/data_spatial'
const domains = process.argv.slice(2).length ? process.argv.slice(2) : ['ecmwf_ifs', 'ecmwf_ifs025', 'ncep_gfs013', 'ncep_gfs025', 'dwd_icon', 'ncep_gfs_graphcast025', 'ecmwf_aifs025_single']
const want = /snow|precip|temperature_2m$|wind_(u|v|speed|gust)|cloud_cover$|freezing|pressure_msl|weather_code/
for (const d of domains) {
  const r = await fetch(`${base}/${d}/latest.json`)
  if (!r.ok) {
    console.log(d, 'HTTP', r.status)
    continue
  }
  const j = await r.json()
  const vt = j.valid_times
  console.log(`\n${d}: run ${j.reference_time}, ${vt.length} steps ${vt[0]} .. ${vt.at(-1)}, completed=${j.completed}`)
  console.log('  step pattern:', vt.slice(0, 4).join(' '), '...', vt.slice(-3).join(' '))
  console.log('  vars:', j.variables.filter((v) => want.test(v)).join(', '))
  console.log('  other keys:', Object.keys(j).join(', '))
}
