// Probe: do Météo-France's daily station files carry recent snow depth for mountain posts?
import { gunzipSync } from 'node:zlib'
const dep = process.argv[2] ?? '73'
const ds = await (await fetch('https://www.data.gouv.fr/api/1/datasets/donnees-climatologiques-de-base-quotidiennes/')).json()
const res = ds.resources.find((r) => new RegExp(`/Q_${dep}_latest-[0-9-]+_autres-parametres\\.csv\\.gz$`).test(r.url))
console.log('file', res?.url, res?.last_modified)
const csv = gunzipSync(Buffer.from(await (await fetch(res.url)).arrayBuffer())).toString('latin1')
const lines = csv.split('\n')
const head = lines[0].split(';')
const col = (n) => head.indexOf(n)
const [iDate, iName, iAlt, iNew, iTot, iTotX] = ['AAAAMMJJ', 'NOM_USUEL', 'ALTI', 'HNEIGEF', 'NEIGETOT06', 'NEIGETOTX'].map(col)
const rows = lines.slice(1).map((l) => l.split(';')).filter((c) => c[iDate] >= '20261101')
const byDate = {}
for (const c of rows) {
  const d = (byDate[c[iDate]] ??= { n: 0, tot: 0, totx: 0, fresh: 0 })
  d.n++
  if (c[iTot]?.trim()) d.tot++
  if (c[iTotX]?.trim()) d.totx++
  if (c[iNew]?.trim()) d.fresh++
}
console.log('per day (stations, with depth 06h, with max depth, with fresh snow):')
for (const [d, v] of Object.entries(byDate).slice(-8)) console.log(' ', d, v.n, v.tot, v.totx, v.fresh)
const last = Object.keys(byDate).filter((d) => byDate[d].tot + byDate[d].totx > 0).at(-1)
console.log('latest day with depth:', last)
for (const c of rows.filter((c) => c[iDate] === last && (c[iTot]?.trim() || c[iTotX]?.trim())).sort((a, b) => Number(b[iAlt]) - Number(a[iAlt])).slice(0, 10)) {
  console.log('  ', c[iName].padEnd(28), `${c[iAlt]} m`.padStart(7), 'depth06', c[iTot], 'depthMax', c[iTotX], 'fresh', c[iNew])
}
