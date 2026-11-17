// End-to-end checks of the built app in a real browser, on a wide screen and on a phone: sorting,
// filters, units, saved mountains, the detail screen, the back button and the map animations.
// Prints one line per check and exits non-zero if any fails.
//
// Usage: node scripts/check-ui.ts [baseUrl]
//   npm run build && npx vite preview --port 4173   (in another terminal)
import { chromium, type Page } from 'playwright-core'

const base = process.argv[2] ?? 'http://127.0.0.1:4173/'
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] })
let failed = 0

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    console.log(`PASS  ${name}`)
  } catch (e) {
    failed++
    console.log(`FAIL  ${name}\n      ${String(e).split('\n')[0].slice(0, 300)}`)
  }
}
function expect(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message)
}
const num = (s: string | null) => Number((s ?? '').replace(/[^0-9.]/g, ''))
const sortedDesc = (v: number[]) => v.every((x, i) => i === 0 || v[i - 1] >= x)
const sortedAsc = (v: number[]) => v.every((x, i) => i === 0 || v[i - 1] <= x)

async function open(viewport: { width: number; height: number }, mobile = false): Promise<Page> {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, locale: 'en-US' })
  const page = await ctx.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })
  return page
}

/** How many charts a detail screen drew, and whether from live model data or the snapshot. */
async function detailCharts(page: Page): Promise<{ live: boolean; charts: number; days: number }> {
  await page.waitForSelector('.detail .daystrip', { timeout: 30_000 })
  await page.waitForSelector('.detail .chart svg', { timeout: 30_000 })
  return {
    live: (await page.locator('.status.is-error').count()) === 0,
    charts: await page.locator('.detail .chart svg').count(),
    days: await page.locator('.daystrip .day').count(),
  }
}

// --- Wide screen: the table -------------------------------------------------------------------
{
  const page = await open({ width: 1360, height: 900 })
  /** Text of column `col` (1-based) for the first `n` table rows. */
  const column = (col: number, n = 12) =>
    page.locator(`table.rank tbody tr td:nth-child(${col})`).evaluateAll((cells, limit) => cells.slice(0, limit).map((c) => c.textContent ?? ''), n)
  const header = (label: string) => page.locator('table.rank th button', { hasText: label })
  const period = () => page.locator('.period button[aria-pressed=true]').textContent()
  const level = (name: string) => page.locator('.controls .seg').first().getByRole('button', { name, exact: true })

  await check('default ranking is by 7-day snowfall, deepest first', async () => {
    const v = (await column(10)).map(num)
    expect(v.length === 12 && sortedDesc(v) && v[0] > 0, `7-day column: ${v.join(', ')}`)
    expect((await period()) === '7 days', 'the period bar should show 7 days')
  })

  for (const [label, col] of [['Vertical', 3], ['Base', 4], ['Summit', 5]] as const) {
    await check(`sorts by ${label.toLowerCase()}, then reverses on a second click`, async () => {
      await header(label).click()
      const desc = (await column(col)).map(num)
      expect(sortedDesc(desc), `descending ${label}: ${desc.join(', ')}`)
      await header(label).click()
      const asc = (await column(col)).map(num)
      expect(sortedAsc(asc) && asc[0] < desc[0], `ascending ${label}: ${asc.join(', ')}`)
    })
  }

  for (const [label, col] of [['Last 24h', 7], ['Last 72h', 8], ['3 days', 9], ['14 days', 11]] as const) {
    await check(`sorts by snowfall, ${label}`, async () => {
      await header(label).click()
      const v = (await column(col)).map(num)
      expect(sortedDesc(v), `${label}: ${v.join(', ')}`)
      expect((await period()) === label.replace('Last ', ''), `the period bar should follow the column, but shows ${await period()}`)
    })
  }

  await check('elevation level changes the snowfall shown', async () => {
    await page.locator('.period').getByRole('button', { name: '7 days' }).click()
    // Rank by name so the same mountains are compared at both levels.
    await header('Mountain').click()
    await level('Summit').click()
    const top = (await column(10, 40)).map(num)
    await level('Base').click()
    const baseVals = (await column(10, 40)).map(num)
    const sum = (v: number[]) => v.reduce((a, b) => a + b, 0)
    expect(sum(top) > sum(baseVals), `summit ${sum(top)} should exceed base ${sum(baseVals)}`)
    await level('Mid').click()
  })

  await check('units switch between inches / feet and centimetres / metres', async () => {
    await page.getByRole('button', { name: 'cm / m' }).click()
    const m = num((await column(3, 1))[0])
    expect((await page.locator('table.rank th').nth(2).textContent())?.includes(', m'), 'vertical header should say m')
    await page.getByRole('button', { name: 'in / ft' }).click()
    const ft = num((await column(3, 1))[0])
    expect(Math.abs(ft / m - 3.28084) < 0.01, `${ft} ft vs ${m} m`)
  })

  await check('search narrows the list', async () => {
    await page.locator('#f-q').fill('zermatt')
    const names = await column(2, 50)
    expect(names.length > 0 && names.every((n) => /zermatt/i.test(n)), names.join(' | ').slice(0, 200))
    await page.locator('#f-q').fill('')
  })

  await check('region and size filters apply together', async () => {
    await page.locator('#f-region').selectOption('Asia')
    await page.locator('#f-vert').selectOption('1000')
    await page.getByRole('button', { name: 'cm / m' }).click()
    const where = await column(2, 60)
    const vert = (await column(3, 60)).map(num)
    expect(where.length > 0 && vert.every((v) => v >= 1000), `verticals: ${vert.join(', ')}`)
    expect(where.every((w) => !/United States|France|Canada|Switzerland/.test(w)), 'only Asian mountains expected')
    await page.locator('#f-region').selectOption('')
    await page.locator('#f-vert').selectOption('0')
    await page.getByRole('button', { name: 'in / ft' }).click()
  })

  await check('a pass filter shows only mountains on that pass', async () => {
    const chip = page.locator('.chips .chip').nth(1)
    const label = (await chip.textContent())!.replace(/\s*\d+\s*$/, '').replace(/ Pass$/, '').trim()
    const count = num((await chip.locator('.count').textContent()) ?? '')
    await chip.click()
    const rows = await column(2, 60)
    expect(rows.length > 0 && rows.every((r) => r.includes(label)), `rows missing the ${label} tag: ${rows.filter((r) => !r.includes(label)).slice(0, 3).join(' | ')}`)
    expect((await page.locator('.summary').textContent())!.startsWith(count.toLocaleString('en-US')), `summary should count ${count}`)
    await page.locator('.chips .chip').nth(0).click()
  })

  await check('sorts by measured snow depth, and opens to the station readings', async () => {
    await header('Depth').click()
    const v = (await column(6)).map(num)
    expect(sortedDesc(v) && v[0] > 0, `depth column: ${v.join(', ')}`)
    await page.locator('.name-btn').first().click()
    await page.waitForSelector('.detail .measured li', { timeout: 30_000 })
    const reading = (await page.locator('.detail .measured li').first().textContent())!
    expect(/Snow on the ground at .+ km away/.test(reading), `first reading: ${reading.slice(0, 120)}`)
    await page.getByRole('button', { name: 'Back to the list' }).click()
    await page.waitForSelector('.detail', { state: 'detached', timeout: 5000 })
    await page.locator('.period').getByRole('button', { name: '7 days' }).click()
  })

  await check('sorting by confidence puts the most agreed forecasts first', async () => {
    await header('Confidence').click()
    const cells = await column(12, 20)
    expect(cells.every((c) => c.includes('High confidence')), `top rows: ${cells.slice(0, 3).join(' | ')}`)
    await page.locator('.period').getByRole('button', { name: '7 days' }).click()
  })

  await check('opening a mountain shows its forecast and charts; back closes it', async () => {
    await page.locator('.name-btn').first().click()
    const d = await detailCharts(page)
    expect(page.url().includes('#r='), 'the open mountain should be in the URL')
    expect(d.days === 14, `${d.days} days in the day-by-day strip`)
    // Four charts from live model data, or two from the snapshot when the live fetch is refused.
    expect(d.charts >= (d.live ? 4 : 2), `${d.charts} charts with ${d.live ? 'live data' : 'the snapshot fallback'}`)
    console.log(`      charts drawn from ${d.live ? 'live model data' : 'the snapshot (the forecast API refused the live fetch)'}`)
    await page.goBack()
    await page.waitForSelector('.detail', { state: 'detached', timeout: 5000 })
  })

  await check('the share button copies the mountain link', async () => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.locator('.name-btn').first().click()
    await page.waitForSelector('.detail .daystrip', { timeout: 30_000 })
    await page.getByRole('button', { name: /^Share the/ }).click()
    await page.waitForSelector('.toast:has-text("Link copied")', { timeout: 5000 })
    expect((await page.evaluate(() => navigator.clipboard.readText())) === page.url(), 'the clipboard should hold the page address')
    await page.getByRole('button', { name: 'Back to the list' }).click()
    await page.waitForSelector('.detail', { state: 'detached', timeout: 5000 })
  })

  await check('a shared link opens straight on the mountain, and Back stays on the site', async () => {
    await page.locator('.name-btn').first().click()
    const url = page.url()
    const fresh = await page.context().newPage()
    await fresh.goto(url, { waitUntil: 'networkidle' })
    await fresh.waitForSelector('.detail')
    await fresh.getByRole('button', { name: 'Back to the list' }).click()
    await fresh.waitForSelector('.detail', { state: 'detached', timeout: 5000 })
    expect(fresh.url().startsWith(base) && !fresh.url().includes('#r='), `ended at ${fresh.url()}`)
    await fresh.close()
  })
  await page.context().close()
}

// --- Wide screen: the map ---------------------------------------------------------------------
{
  const page = await open({ width: 1360, height: 900 })
  await page.getByRole('tab', { name: 'Map' }).click()
  await page.waitForSelector('.map-shell', { timeout: 30_000 })
  await page.waitForFunction(() => !document.querySelector('.map-loading'), null, { timeout: 30_000 })
  const slider = page.locator('.timeline input[type=range]')

  await check('map: day-by-day animation plays through the forecast', async () => {
    await page.getByRole('button', { name: 'Day by day' }).click()
    const label0 = await page.locator('.timeline .when').textContent()
    await page.getByRole('button', { name: 'Play the animation' }).click()
    await page.waitForFunction(() => Number((document.querySelector('.timeline input[type=range]') as HTMLInputElement).value) >= 3, null, { timeout: 15_000 })
    await page.getByRole('button', { name: 'Pause the animation' }).click()
    expect((await page.locator('.timeline .when').textContent()) !== label0, 'the date label should move with the slider')
    await page.locator('.map-panel.layers .seg button').first().click()
  })

  await check('map: live radar loads its frames and animates', async () => {
    await page.locator('#m-overlay').selectOption('radar')
    await page.waitForSelector('.map-note:has-text("Radar at")', { timeout: 20_000 })
    const first = await page.locator('.map-note', { hasText: 'Radar at' }).textContent()
    await page.waitForFunction((t) => document.querySelector('.legend-box .map-note')?.textContent !== t, first, { timeout: 15_000 })
  })

  await check('map: model snowfall layer steps through forecast hours on Play', async () => {
    await page.locator('#m-overlay').selectOption('snowfall_water_equivalent')
    await page.waitForSelector('.timeline', { timeout: 30_000 })
    const steps = Number(await slider.getAttribute('max')) + 1
    expect(steps > 60, `only ${steps} forecast steps on the timeline`)
    const start = Number(await slider.inputValue())
    await page.getByRole('button', { name: 'Play the animation' }).click()
    await page.waitForFunction((s) => Number((document.querySelector('.timeline input[type=range]') as HTMLInputElement).value) >= s + 2, start, { timeout: 60_000 })
    await page.getByRole('button', { name: 'Pause the animation' }).click()
    expect((await page.locator('.legend-box').textContent())!.includes('Snowfall, mm of water per hour'), 'the model layer needs its legend')
  })
  await page.context().close()
}

// --- Phone ------------------------------------------------------------------------------------
{
  const page = await open({ width: 390, height: 844 }, true)
  const cardNames = () => page.locator('.mcard .name').evaluateAll((els) => els.slice(0, 20).map((e) => e.textContent ?? ''))
  const openSheet = async (chipText: string) => {
    await page.locator('.fchip', { hasText: chipText }).click()
    await page.waitForSelector('.sheet')
  }
  const closeSheet = async () => {
    await page.locator('.sheet-foot .primary-btn').click()
    await page.waitForSelector('.sheet', { state: 'detached' })
  }

  await check('phone: no sideways scrolling, and the first mountain is on the first screen', async () => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow <= 0, `page is ${overflow}px wider than the screen`)
    const top = (await page.locator('.mcard').first().boundingBox())!.y
    expect(top < 280, `the first card starts ${Math.round(top)}px down`)
  })

  await check('phone: the period bar re-ranks the list', async () => {
    const before = await cardNames()
    await page.locator('.period').getByRole('button', { name: '14 days' }).click()
    const v = (await page.locator('.mcard .badge b').evaluateAll((els) => els.slice(0, 10).map((e) => e.textContent ?? ''))).map(num)
    expect(sortedDesc(v), `14-day badges: ${v.join(', ')}`)
    expect((await cardNames()).join() !== before.join(), 'the order should change between 7 and 14 days')
    await page.locator('.period').getByRole('button', { name: '7 days' }).click()
  })

  await check('phone: sort by vertical drop from the filter sheet', async () => {
    await openSheet('Most snow')
    await page.locator('.choice', { hasText: 'Vertical drop' }).click()
    await closeSheet()
    const v = (await page.locator('.mcard .fact span:first-child').evaluateAll((els) => els.slice(0, 10).map((e) => e.textContent ?? ''))).map(num)
    expect(v.length === 10 && sortedDesc(v), v.join(', '))
    await openSheet('Vertical drop')
    await page.locator('.choice', { hasText: 'Most snow' }).click()
    await closeSheet()
  })

  await check('phone: deepest snow on the ground ranks by station measurements', async () => {
    await openSheet('Most snow')
    await page.locator('.choice', { hasText: 'Deepest snow on the ground' }).click()
    await closeSheet()
    const facts = await page.locator('.mcard .fact').evaluateAll((els) => els.slice(0, 8).map((e) => e.textContent ?? ''))
    const depths = facts.map((f) => num(f.split('·')[1] ?? ''))
    expect(facts.every((f) => f.includes('on the ground')) && sortedDesc(depths) && depths[0] > 0, facts.slice(0, 3).join(' | '))
    await openSheet('Deepest snow')
    await page.locator('.choice', { hasText: 'Most snow' }).click()
    await closeSheet()
  })

  await check('phone: a pass picked in the sheet filters the list and marks its chip', async () => {
    await openSheet('Any pass')
    await page.locator('.choice', { hasText: 'Ikon' }).click()
    await closeSheet()
    const tags = await page.locator('.mcard').evaluateAll((els) => els.slice(0, 20).map((e) => e.textContent ?? ''))
    expect(tags.length > 0 && tags.every((t) => t.includes('Ikon')), 'every card should carry the Ikon tag')
    expect((await page.locator('.fchip.is-on').first().textContent())!.includes('Ikon'), 'the pass chip should name the choice')
    await openSheet('Ikon')
    await page.locator('.sheet .link-btn', { hasText: 'Reset' }).click()
    await closeSheet()
  })

  await check('phone: a saved mountain appears under Saved and survives a reload', async () => {
    const name = (await cardNames())[0]
    await page.locator('.mcard .star').first().click()
    await page.getByRole('tab', { name: 'Saved' }).click()
    expect((await cardNames()).join() === name, `Saved shows: ${(await cardNames()).join(', ')}`)
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: 'Saved' }).click()
    expect((await cardNames()).join() === name, 'the saved mountain should still be there after a reload')
    await page.locator('.mcard .star').first().click()
    await page.waitForSelector('.empty')
    await page.getByRole('tab', { name: 'Rankings' }).click()
  })

  await check('phone: the detail screen fits, and tapping a day shows that day', async () => {
    await page.locator('.mcard-main').first().click()
    const d = await detailCharts(page)
    expect(d.days === 14, `${d.days} days in the strip`)
    const overflow = await page.locator('.detail').evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(overflow <= 0, `detail is ${overflow}px wider than the screen`)
    const day = page.locator('.daystrip .day').nth(5)
    await day.click()
    expect((await day.getAttribute('aria-selected')) === 'true', 'the tapped day should be selected')
    const heading = (await page.locator('.day-detail b').textContent())!
    expect(heading.includes(String(num(await day.locator('.dom').textContent()))), `day detail shows ${heading}`)
    await page.getByRole('button', { name: 'Back to the list' }).click()
    await page.waitForSelector('.detail', { state: 'detached', timeout: 5000 })
  })

  await check('phone: the map fills the screen without scrolling the page', async () => {
    await page.getByRole('tab', { name: 'Map' }).click()
    await page.waitForSelector('.map-shell', { timeout: 30_000 })
    await page.waitForFunction(() => !document.querySelector('.map-loading'), null, { timeout: 30_000 })
    const fit = await page.evaluate(() => ({ page: document.documentElement.scrollHeight, screen: innerHeight, map: document.querySelector('.map-shell')!.getBoundingClientRect().height }))
    expect(fit.page <= fit.screen + 1, `page is ${fit.page}px tall on a ${fit.screen}px screen`)
    expect(fit.map > 400, `the map is only ${Math.round(fit.map)}px tall`)
  })
  await page.context().close()
}

await browser.close()
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed')
process.exit(failed ? 1 : 0)
