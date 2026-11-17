// Drives the built app in a real browser and saves screenshots, for checking a change by eye.
// Console errors and failed requests are printed, so a broken view is not mistaken for a blank one.
//
// Usage: node scripts/shots.ts [baseUrl] [outDir] [shot,shot,...]
//   npm run build && npx vite preview --port 4173   (in another terminal)
import { mkdirSync } from 'node:fs'
import { chromium, type Page } from 'playwright-core'

const base = process.argv[2] ?? 'http://127.0.0.1:4173/'
const out = process.argv[3] ?? 'data/build/shots'
const only = process.argv[4]?.split(',')
mkdirSync(out, { recursive: true })

const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const DESKTOP = { width: 1360, height: 900, deviceScaleFactor: 1 }
type Viewport = typeof PHONE | typeof DESKTOP

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })

async function shot(name: string, viewport: Viewport, scheme: 'light' | 'dark', run: (page: Page) => Promise<void>, fullPage = false) {
  if (only && !only.includes(name)) return
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: viewport.deviceScaleFactor, isMobile: 'isMobile' in viewport, hasTouch: 'hasTouch' in viewport, colorScheme: scheme, locale: 'en-US' })
  const page = await ctx.newPage()
  const problems: string[] = []
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text().slice(0, 300)}`))
  page.on('pageerror', (e) => problems.push(`pageerror: ${String(e).slice(0, 300)}`))
  page.on('requestfailed', (r) => problems.push(`failed: ${r.url().slice(0, 140)} ${r.failure()?.errorText ?? ''}`))
  page.on('response', (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()}: ${r.url().slice(0, 140)}`))
  try {
    await page.goto(base, { waitUntil: 'networkidle' })
    await run(page)
    await page.screenshot({ path: `${out}/${name}.png`, fullPage })
    console.log(`${name}: ok${problems.length ? `, ${problems.length} problems` : ''}`)
  } catch (e) {
    await page.screenshot({ path: `${out}/${name}-FAILED.png` }).catch(() => {})
    console.log(`${name}: FAILED ${String(e).slice(0, 400)}`)
  }
  for (const p of [...new Set(problems)].slice(0, 8)) console.log(`   ${p}`)
  await ctx.close()
}

const openMap = async (page: Page) => {
  await page.getByRole('tab', { name: 'Map' }).click()
  await page.waitForSelector('.map-panel.layers')
  await page.waitForFunction(() => !document.querySelector('.map-loading'), null, { timeout: 30_000 })
  await page.waitForTimeout(2500)
}
/** Open the first mountain in the list (a card on a phone, a table row on a wide screen). */
const openFirst = async (page: Page) => {
  await page.locator('.mcard-main, .name-btn').first().click()
  await page.waitForSelector('.detail .daystrip', { timeout: 30_000 })
}
const liveCharts = (page: Page) => page.waitForSelector('.detail .chart svg', { timeout: 30_000 })

await shot('phone-rankings', PHONE, 'light', async () => {})
await shot('phone-rankings-dark', PHONE, 'dark', async () => {})
await shot('phone-filters', PHONE, 'light', async (page) => {
  await page.locator('.fchip').first().click()
  await page.waitForSelector('.sheet')
  await page.waitForTimeout(400)
})
await shot('phone-saved-empty', PHONE, 'dark', async (page) => {
  await page.getByRole('tab', { name: 'Saved' }).click()
})
await shot('phone-detail', PHONE, 'light', async (page) => {
  await openFirst(page)
  await liveCharts(page)
  await page.waitForTimeout(400)
})
await shot('phone-detail-dark-long', { ...PHONE, height: 3400 }, 'dark', async (page) => {
  await page.locator('#f-q').fill('verbier')
  await openFirst(page)
  await liveCharts(page)
  await page.waitForTimeout(600)
})
/** Open a mountain by name and switch to its Mountain tab, with the trail map drawn. */
const openMountain = async (page: Page, query: string) => {
  await page.locator('#f-q').fill(query)
  await page.locator('.mcard-main, .name-btn').first().click()
  await page.getByRole('button', { name: 'Mountain and trails' }).click()
  await page.waitForSelector('.trailmap .map canvas', { timeout: 30_000 })
  await page.waitForFunction(() => !document.querySelector('.trailmap .map-loading'), null, { timeout: 30_000 })
  await page.waitForTimeout(5000)
}
await shot('phone-mountain-live', { ...PHONE, height: 3600 }, 'light', (page) => openMountain(page, 'winter park resort'))
await shot('phone-mountain-europe', { ...PHONE, height: 3000 }, 'dark', (page) => openMountain(page, 'st. anton'))
await shot('phone-trailmap', PHONE, 'light', async (page) => {
  await openMountain(page, 'winter park resort')
  await page.locator('.trailmap').scrollIntoViewIfNeeded()
  await page.getByRole('button', { name: 'Full screen' }).click()
  await page.waitForTimeout(3500)
})
await shot('desktop-trailmap-3d', DESKTOP, 'light', async (page) => {
  await openMountain(page, 'palisades tahoe olympic')
  await page.getByRole('button', { name: 'Full screen' }).click()
  await page.getByRole('button', { name: '3D' }).click()
  await page.waitForTimeout(7000)
})
await shot('desktop-rankings', DESKTOP, 'light', async () => {})
await shot('desktop-rankings-dark', DESKTOP, 'dark', async () => {})
await shot('desktop-detail', { ...DESKTOP, height: 2400 }, 'light', async (page) => {
  await openFirst(page)
  await liveCharts(page)
  const box = await page.locator('.detail .chart svg').first().boundingBox()
  if (box) await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5)
  await page.waitForTimeout(400)
})
await shot('desktop-map', DESKTOP, 'light', openMap)
await shot('phone-map', PHONE, 'light', openMap)
await shot('phone-map-daily-dark', PHONE, 'dark', async (page) => {
  await openMap(page)
  await page.getByRole('button', { name: 'Day by day' }).click()
  await page.locator('.timeline input[type=range]').fill('3')
  await page.waitForTimeout(1200)
})
await shot('desktop-map-radar', DESKTOP, 'dark', async (page) => {
  await openMap(page)
  await page.locator('#m-overlay').selectOption('radar')
  await page.waitForTimeout(6000)
})
await shot('desktop-map-model', DESKTOP, 'light', async (page) => {
  await openMap(page)
  await page.locator('#m-overlay').selectOption('snowfall_water_equivalent')
  await page.waitForSelector('.timeline', { timeout: 30_000 })
  await page.locator('.timeline input[type=range]').fill('8')
  await page.waitForTimeout(12_000)
})

await browser.close()
