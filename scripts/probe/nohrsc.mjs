// Probe: NOAA NOHRSC national station reports (snow depth and snowfall), newest files with data.
const UA = { 'user-agent': 'snow-tracker-probe' }
const text = async (url) => (await fetch(url, { signal: AbortSignal.timeout(90_000), headers: UA })).text()
const ym = new Date().toISOString().slice(0, 7).replace('-', '')
for (const kind of ['snowdepth', 'snowfall']) {
  const dir = `https://www.nohrsc.noaa.gov/nsa/discussions_text/National/${kind}/${ym}/`
  const files = [...(await text(dir)).matchAll(/href="([^"]+_m\.txt)"/g)].map((m) => m[1])
  console.log(`\n${kind}: ${files.length} metric files`)
  let shown = 0
  for (const f of files.reverse()) {
    const body = await text(dir + f)
    const lines = body.split('\n').filter((l) => l && !l.startsWith('!') && !l.startsWith('Station_Id'))
    console.log(`  ${f}: ${lines.length} reports`)
    if (lines.length > 50 && shown < 1) {
      shown++
      console.log('   ', body.split('\n').slice(0, 3).join(' // ').slice(0, 300))
      for (const l of lines.slice(0, 4)) console.log('   ', l.slice(0, 200))
      const elems = {}
      const durs = {}
      const units = {}
      for (const l of lines) {
        const c = l.split('|')
        elems[c[5]] = (elems[c[5]] ?? 0) + 1
        units[c[8]] = (units[c[8]] ?? 0) + 1
        if (kind === 'snowfall') durs[`${c[9]} ${c[10]}`] = (durs[`${c[9]} ${c[10]}`] ?? 0) + 1
      }
      console.log('    elements', JSON.stringify(elems).slice(0, 300), 'units', JSON.stringify(units), kind === 'snowfall' ? 'durations ' + JSON.stringify(durs).slice(0, 300) : '')
      const high = lines.map((l) => l.split('|')).filter((c) => Number(c[4]) > 2500).slice(0, 4)
      for (const c of high) console.log('    high station:', c.join('|').slice(0, 200))
      const times = lines.map((l) => l.split('|')[6]).sort()
      console.log('    report times', times[0], '..', times.at(-1))
    }
    if (shown >= 1 && lines.length > 50) break
  }
}
