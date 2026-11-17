// Probe: which resort operators serve lift and trail status as plain JSON, whether a browser on
// another site may read it (CORS), and whether their robots.txt objects.
// Usage: node scripts/probe/status-feeds.mjs [name ...]
const want = process.argv.slice(2)
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; snow-tracker-probe)', origin: 'https://example.org', accept: 'application/json,text/html;q=0.8,*/*;q=0.5' }
const get = async (url) => {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(25_000), headers: UA, redirect: 'follow' })
    const text = await r.text()
    return { status: r.status, cors: r.headers.get('access-control-allow-origin'), type: (r.headers.get('content-type') ?? '').split(';')[0], text }
  } catch (e) {
    return { status: 0, cors: null, type: '', text: String(e.cause?.code ?? e.message ?? e).slice(0, 60) }
  }
}
const brief = (r, n = 260) => `${r.status} cors=${r.cors} ${r.type} ${r.text.length}b ${r.text.slice(0, n).replace(/\s+/g, ' ')}`

const groups = {
  powdr: [
    'https://api.killington.com/api/v1/dor/drupal/lifts',
    'https://api.killington.com/api/v1/dor/drupal/trails',
    'https://api.coppercolorado.com/api/v1/dor/drupal/lifts',
    'https://api.mtbachelor.com/api/v1/dor/drupal/lifts',
    'https://api.eldora.com/api/v1/dor/drupal/lifts',
    'https://api.picomountain.com/api/v1/dor/drupal/lifts',
    'https://api.snowbird.com/api/v1/dor/drupal/lifts',
  ],
  intermaps: [
    'https://winter.intermaps.com/ski_arlberg/data?lang=en',
    'https://winter.intermaps.com/skiarlberg/data?lang=en',
    'https://winter.intermaps.com/zermatt/data?lang=en',
    'https://winter.intermaps.com/ischgl/data?lang=en',
    'https://winter.intermaps.com/saalbach/data?lang=en',
    'https://winter.intermaps.com/kitzbuehel/data?lang=en',
  ],
  skiplan: [
    'https://www.skiplan.com/php/genererXml.php?station=valthorens&region=alpes&pays=france',
    'https://www.skiplan.com/php/genererXml.php?country=france&region=alpes&station=chamonix&v=1',
    'https://www.lumiplan.pro/',
  ],
  vail: ['https://www.vail.com/robots.txt', 'https://www.vail.com/the-mountain/mountain-conditions/terrain-and-lift-status.aspx', 'https://www.epicpass.com/info/opening-dates.aspx'],
  others: [
    'https://www.jacksonhole.com/api/all.json',
    'https://www.aspensnowmass.com/aspensnowmass/liftstatus/feed',
    'https://bigskyresort.com/api/lift-status',
    'https://api.bigskyresort.com/lifts',
    'https://www.alta.com/api/lift-and-terrain-status',
    'https://www.skitaos.com/api/lifts',
    'https://www.whistlerblackcomb.com/robots.txt',
  ],
}

for (const [name, urls] of Object.entries(groups)) {
  if (want.length && !want.includes(name)) continue
  console.log(`\n== ${name}`)
  for (const url of urls) console.log(`  ${url.replace('https://', '').slice(0, 78).padEnd(78)} ${brief(await get(url))}`)
}
