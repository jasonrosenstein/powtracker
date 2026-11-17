// Probe: the shape of one Intermaps resort feed, and which resort slugs exist.
// Usage: node scripts/probe/intermaps.mjs [slug ...]
const get = async (slug) => {
  try {
    const r = await fetch(`https://winter.intermaps.com/${slug}/data?lang=en`, { signal: AbortSignal.timeout(25_000), headers: { 'user-agent': 'snow-tracker-probe' } })
    return r.ok ? await r.json() : null
  } catch {
    return null
  }
}
const tally = (rows, f) => Object.entries(rows.reduce((m, r) => ((m[f(r)] = (m[f(r)] ?? 0) + 1), m), {})).map(([k, v]) => `${k}:${v}`).join(' ')

const slugs = process.argv.slice(2)
if (slugs.length === 0) {
  const j = await get('skiarlberg')
  console.log('keys', Object.keys(j).join(', '))
  for (const k of Object.keys(j)) console.log(` ${k}:`, Array.isArray(j[k]) ? `${j[k].length} items` : JSON.stringify(j[k]).slice(0, 200))
  console.log('lift', JSON.stringify(j.lifts[0]).slice(0, 900))
  console.log('slope', JSON.stringify(j.slopes?.[0]).slice(0, 900))
  console.log('lift status', tally(j.lifts, (l) => l.status), '| slope status', tally(j.slopes ?? [], (s) => s.status))
  console.log('slope types', tally(j.slopes ?? [], (s) => JSON.stringify(s.popup?.types ?? s.type)).slice(0, 300), '| subtitles', tally(j.slopes ?? [], (s) => s.popup?.subtitle).slice(0, 300))
} else {
  for (const slug of slugs) {
    const j = await get(slug)
    console.log(slug.padEnd(28), j ? `OK lifts ${j.lifts?.length ?? 0} slopes ${j.slopes?.length ?? 0} | ${tally(j.lifts ?? [], (l) => l.status)}` : '-')
  }
}
