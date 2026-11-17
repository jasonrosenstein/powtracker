// Probe, third pass: US mountain snow observations without the NRCS server, and file sizes.
const want = process.argv.slice(2)
const UA = { 'user-agent': 'snow-tracker-probe' }
const text = async (url) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: UA })
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url.slice(0, 120)}`)
  return r.text()
}
const d = new Date(Date.now() - 86400000)
const ymd = d.toISOString().slice(0, 10).replace(/-/g, '')
const ym = ymd.slice(0, 6)

const sources = {
  async nohrsc() {
    for (const url of [
      `https://www.nohrsc.noaa.gov/nsa/discussions_text/National/snowdepth/${ym}/`,
      `https://www.nohrsc.noaa.gov/nsa/discussions_text/National/snowfall/${ym}/`,
      `https://www.nohrsc.noaa.gov/nsa/discussions_text/National/swe/${ym}/`,
    ]) {
      try {
        const t = await text(url)
        const files = [...t.matchAll(/href="([^"]+\.txt)"/g)].map((m) => m[1])
        console.log('  dir', url.slice(48), files.length, 'files; last:', files.slice(-3).join(', '))
        if (files.length) {
          const f = await text(url + files.at(-1))
          const lines = f.split('\n')
          console.log('    lines', lines.length, '\n    ' + lines.slice(0, 6).map((l) => l.slice(0, 170)).join('\n    '))
          console.log('    ...', lines.find((l) => /SNOTEL|SNTL|UT/.test(l))?.slice(0, 170))
        }
      } catch (e) {
        console.log('  FAIL', String(e.message).slice(0, 150))
      }
    }
  },
  async cdec() {
    const end = new Date().toISOString().slice(0, 10)
    const start = new Date(Date.now() - 4 * 86400000).toISOString().slice(0, 10)
    const t = await text(`https://cdec.water.ca.gov/dynamicapp/req/JSONDataServlet?Stations=CSL,SQV,MHP&SensorNums=18&dur_code=D&Start=${start}&End=${end}`)
    console.log('  ', t.length, t.slice(0, 500))
  },
  async france() {
    for (const f of ['Q_73_latest-2025-2026_RR-T-Vent.csv.gz', 'Q_73_latest-2025-2026_autres-parametres.csv.gz']) {
      const r = await fetch(`https://meteofrance.s3.sbg.io.cloud.ovh.net/data/synchro_ftp/BASE/QUOT/${f}`, { method: 'HEAD', signal: AbortSignal.timeout(30_000) })
      console.log('  ', f, r.status, Math.round(Number(r.headers.get('content-length')) / 1e6 * 10) / 10, 'MB', r.headers.get('last-modified'))
    }
    // The header line tells which file carries the snow columns.
    const { gunzipSync } = await import('node:zlib')
    for (const f of ['Q_73_latest-2025-2026_RR-T-Vent.csv.gz', 'Q_73_latest-2025-2026_autres-parametres.csv.gz']) {
      const r = await fetch(`https://meteofrance.s3.sbg.io.cloud.ovh.net/data/synchro_ftp/BASE/QUOT/${f}`, { signal: AbortSignal.timeout(120_000) })
      const csv = gunzipSync(Buffer.from(await r.arrayBuffer())).toString('latin1')
      const lines = csv.split('\n')
      const head = lines[0].split(';')
      console.log('  ', f, 'rows', lines.length, 'snow cols:', head.filter((h) => /NEIG|HNEIG/i.test(h)).join(','), '| first cols', head.slice(0, 8).join(','))
      const idx = head.findIndex((h) => /^HNEIGEF$/i.test(h))
      const tot = head.findIndex((h) => /^NEIGETOT/i.test(h))
      const last = lines.filter((l) => l.includes(`;${ymd};`)).map((l) => l.split(';')).filter((c) => (idx >= 0 && c[idx]?.trim()) || (tot >= 0 && c[tot]?.trim()))
      console.log('    rows for', ymd, 'with snow values:', last.length, last.slice(0, 3).map((c) => [c[0], c[1], c[2], c[3], c[4], c[5], idx >= 0 ? c[idx] : '', tot >= 0 ? c[tot] : ''].join('|')).join('  //  '))
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
