// Probe: re-read the pages behind a sample of opening dates and look for each date on its page.
// A miss is not a disproof (many resort sites render with scripts); a hit shows the page's words.
// Usage: node scripts/probe/openings-verify.mjs <research file> <sample size> [name filter]
import { readFileSync } from 'node:fs'

const [file, size = '30', filter = ''] = process.argv.slice(2)
const research = JSON.parse(readFileSync(file, 'utf8'))
const MONTHS = {
  9: ['september', 'sept', 'sep', 'septembre', 'settembre', 'syyskuu'],
  10: ['october', 'oct', 'oktober', 'okt', 'octobre', 'ottobre', 'lokakuu'],
  11: ['november', 'nov', 'novembre', 'noviembre', 'marraskuu'],
  12: ['december', 'dec', 'dezember', 'dez', 'décembre', 'decembre', 'dicembre', 'diciembre', 'desember', 'joulukuu'],
  1: ['january', 'jan', 'januar', 'janvier', 'gennaio', 'enero', 'januari'],
  2: ['february', 'feb', 'februar', 'février', 'febbraio', 'febrero', 'februari'],
}

/** Every way a page is likely to print this day. */
function renderings(date) {
  const [y, m, d] = date.split('-').map(Number)
  const dd = String(d).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  const out = [`${dd}.${mm}.`, `${d}.${m}.`, `${dd}/${mm}`, `${mm}/${dd}`, `${m}/${d}`, `${d}/${m}`, date, `${m}月${d}日`, `${y}/${mm}/${dd}`, `${dd}-${mm}-${y}`]
  for (const name of MONTHS[m] ?? []) out.push(`${d} ${name}`, `${d}. ${name}`, `${d}er ${name}`, `${d}th ${name}`, `${name} ${d}`, `${name}. ${d}`, `${d}st ${name}`, `${d}nd ${name}`, `${d}rd ${name}`, `${dd} ${name}`)
  return out
}

const pool = research.openings.filter((o) => o.date && o.source && o.name.toLowerCase().includes(filter.toLowerCase()) && !/skiresort\./.test(o.source))
// A fixed stride through the file, so the sample is spread and repeatable.
const step = Math.max(1, Math.floor(pool.length / Number(size)))
const sample = pool.filter((_, i) => i % step === 0).slice(0, Number(size))
let hit = 0
let unread = 0
for (const o of sample) {
  let text = ''
  try {
    const res = await fetch(o.source, { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', 'accept-language': 'en' }, signal: AbortSignal.timeout(25_000) })
    text = (await res.text()).replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')
    if (!res.ok) text = ''
  } catch {
    text = ''
  }
  const lower = text.toLowerCase()
  const found = renderings(o.date).map((r) => lower.indexOf(r)).filter((i) => i >= 0)
  if (!text) unread++
  if (found.length) hit++
  const at = found.length ? Math.min(...found) : -1
  console.log(`${found.length ? 'FOUND ' : text ? 'absent' : 'unread'} ${o.date} ${o.name.slice(0, 44)} | ${at >= 0 ? `…${text.slice(Math.max(0, at - 50), at + 60)}…` : new URL(o.source).hostname}`)
}
console.log(`\n${hit} of ${sample.length} dates found on their page; ${unread} pages could not be read; ${sample.length - hit - unread} read without the date in the page text`)
