// Drive the built site. Deterministic mixed weather, then a snow-only snapshot. No ingest.
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { PAST_DAYS } from '../src/lib/models.ts'

const base = process.argv[2] ?? 'http://127.0.0.1:4173/'
const url = new URL('#r=f357cc18', base)
const start = Date.UTC(2026, 10, 22)
const hours = Array.from({length:(PAST_DAYS + 15) * 24}, (_, i) => new Date(start + i * 3600000).toISOString().slice(0, 16))
const windHours = hours.slice(PAST_DAYS * 24, (PAST_DAYS + 14) * 24)
const browser = await chromium.launch({channel:'chrome', headless:true})
try {
  for (const metric of [true, false]) {
    const page = await browser.newPage({viewport:{width:390,height:844},colorScheme:metric ? 'light' : 'dark',locale:metric ? 'en-GB' : 'en-US'})
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
    await page.route('**/v1/forecast?**', route => {
      const q = new URL(route.request().url()).searchParams
      if (!q.has('models')) return route.fulfill({json:{hourly:{time:windHours, wind_speed_10m:windHours.map((_, i) => i % 24 === 9 ? 32 : 3), wind_direction_10m:windHours.map((_, i) => i % 24 === 9 ? 270 : 0)}}})
      const hourly = {time:hours, precipitation_ecmwf_ifs:hours.map(() => 1), temperature_2m_ecmwf_ifs:hours.map(() => 1)}
      return route.fulfill({json:{hourly,elevation:Number(q.get('elevation')),utc_offset_seconds:0}})
    })
    await page.goto(url.href)
    const card = page.getByRole('region',{name:'Day by day forecast'}), days = card.getByRole('option')
    const speed = metric ? '32 km/h' : '20 mph'
    await card.getByRole('option',{name:new RegExp(`peak wind ${speed} from W`)}).first().waitFor()
    await card.getByText(metric ? '12' : '0.47',{exact:true}).first().waitFor()
    assert.equal(await days.count(),14)
    assert(await card.locator('.snow .bar').first().evaluate(el => el.clientHeight > 0))
    assert(await card.locator('.rain .bar').first().evaluate(el => el.clientHeight > 0 && /^rgb\((21, 129, 79|39, 162, 105)\)$/.test(getComputedStyle(el).backgroundColor)))
    await days.last().click(); assert.equal(await days.last().getAttribute('aria-selected'),'true')
    assert((await card.locator('.day-detail').innerText()).includes(`${speed} from W`))
    assert.equal(await page.locator('.detail').evaluate(el => el.scrollWidth - el.clientWidth),0)
    await page.getByRole('button',{name:/^Summit/}).last().click()
    assert.equal(await days.last().locator('.rain .amt').innerText(),'0')
    await card.getByText('Daily forecast table').click(); assert.equal(await card.locator('tbody tr').count(),14)
    assert.deepEqual(errors,[]); console.log(`PASS phone ${metric ? 'metric / light' : 'imperial / dark'}: mixed bars, peak wind from west, swipe, units, summit and table`)
    await page.close()
  }
  const p = await browser.newPage({viewport:{width:390,height:844}})
  await p.route('**/v1/forecast?**',r=>r.abort())
  await p.goto(url.href); await p.getByText(/Live model data is not available right now/).waitFor()
  const selected = p.locator('.day-detail')
  assert.match(await selected.innerText(),/Peak wind unavailable/)
  const fallback = p.locator('.daystrip .day'); assert.equal(await fallback.count(),14)
  await p.goto(new URL('?paywall=on#r=f357cc18',base).href); await p.locator('.day.is-locked').first().waitFor()
  assert.equal(await p.locator('.day.is-locked').count(),11); assert.equal(await p.locator('.day.is-locked .wind-row, .day.is-locked .amt').count(),0)
  console.log('PASS wind failure retains snapshot and restricted days do not leak values')
} finally { await browser.close() }
