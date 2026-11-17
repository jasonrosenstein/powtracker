// Probe: where do Open-Meteo's spatial (.om) map files live right now?
import { promises as dns } from 'node:dns'

const hosts = ['maps.open-meteo.com', 'map-tiles.open-meteo.com', 'openmeteo.s3.amazonaws.com', 'spatial.open-meteo.com', 'tiles.open-meteo.com']
for (const h of hosts) {
  try {
    console.log(h, '->', (await dns.resolve4(h)).slice(0, 2).join(' '))
  } catch (e) {
    console.log(h, '-> FAIL', e.code)
  }
}

const tryFetch = async (url) => {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) })
    const t = await r.text()
    console.log(r.status, url, t.length, 'bytes')
    return t
  } catch (e) {
    console.log('ERR', url, String(e.cause ?? e).slice(0, 120))
    return ''
  }
}

const html = await tryFetch('https://maps.open-meteo.com/')
const assets = [...html.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map((m) => m[1])
console.log('js assets', assets.slice(0, 8))
const found = new Set()
for (const a of assets.slice(0, 12)) {
  const js = await tryFetch(new URL(a, 'https://maps.open-meteo.com/').href)
  for (const m of js.matchAll(/https:\/\/[a-zA-Z0-9.-]+\/[a-zA-Z0-9_/.-]*data_spatial[a-zA-Z0-9_/.-]*/g)) found.add(m[0])
  for (const m of js.matchAll(/https:\/\/[a-zA-Z0-9.-]*(?:open-meteo|openmeteo)[a-zA-Z0-9.-]*/g)) found.add(m[0])
}
console.log([...found])
await tryFetch('https://openmeteo.s3.amazonaws.com/data_spatial/dwd_icon/latest.json')
