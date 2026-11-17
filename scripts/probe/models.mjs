// Probe: which Open-Meteo models return hourly precip / temperature / freezing level, and how far out?
// Usage: node scripts/probe/models.mjs
const spots = [
  ['Alta UT', 40.59, -111.64, 2900],
  ['Verbier CH', 46.1, 7.23, 2400],
  ['Niseko JP', 42.86, 140.7, 800],
  ['Portillo CL', -32.84, -70.13, 3000],
  ['Whistler CA', 50.06, -122.95, 1500],
]
const models = [
  'ecmwf_ifs', 'ecmwf_ifs025', 'gfs_seamless', 'icon_seamless', 'gem_seamless', 'jma_seamless',
  'meteofrance_seamless', 'ukmo_seamless', 'bom_access_global', 'cma_grapes_global', 'kma_seamless',
  'meteoswiss_icon_seamless', 'metno_seamless', 'knmi_seamless', 'dmi_seamless', 'italia_meteo_arpae_icon_2i',
  'ncep_aigfs025', 'ecmwf_aifs025_single', 'gfs_graphcast025',
]
const vars = ['precipitation', 'temperature_2m', 'freezing_level_height', 'snowfall']

for (const [name, lat, lon, elev] of spots) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&elevation=${elev}` +
    `&hourly=${vars.join(',')}&forecast_days=16&past_days=3&timezone=GMT&models=${models.join(',')}`
  const res = await fetch(url)
  const body = await res.json()
  if (!res.ok) {
    console.log(name, res.status, JSON.stringify(body).slice(0, 300))
    continue
  }
  console.log(`\n== ${name} elev=${body.elevation} hours=${body.hourly.time.length}`)
  for (const m of models) {
    const cells = vars.map((v) => {
      const arr = body.hourly[`${v}_${m}`]
      if (!arr) return `${v.slice(0, 6)}:absent`
      const n = arr.filter((x) => x != null).length
      let last = -1
      for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) { last = i; break }
      const fcDays = last < 0 ? 0 : ((last + 1) / 24 - 3).toFixed(1)
      return `${v.slice(0, 6)}:${n ? fcDays + 'd' : 'null'}`
    })
    console.log(`  ${m.padEnd(28)} ${cells.join('  ')}`)
  }
}
