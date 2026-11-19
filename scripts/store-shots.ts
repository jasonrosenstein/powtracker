// App Store screenshots at the 6.9-inch iPhone size Apple asks for (1320 x 2868), taken from the
// same screens the app shows. The iPhone app is this site in a native shell, so a phone-shaped
// browser window draws them pixel for pixel.
// Usage: node scripts/store-shots.ts [baseUrl] [outDir]
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const base = process.argv[2] ?? 'https://powtracker.app/'
const out = process.argv[3] ?? 'ios/store/screenshots'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] })
const ctx = await browser.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'en-US' })
const page = await ctx.newPage()
const shot = async (name: string) => {
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${out}/${name}.png` })
  console.log(`wrote ${out}/${name}.png`)
}

await page.goto(base, { waitUntil: 'networkidle' })
await page.waitForSelector('.mcard')
await shot('1-rankings')

// A well-known mountain with a live lift feed, for the forecast and the trail map.
await page.locator('#f-q').fill('Sölden')
await page.locator('.mcard-main').first().click()
await page.waitForSelector('.daystrip')
await page.waitForFunction(() => document.querySelectorAll('.detail svg').length > 3, null, { timeout: 30_000 }).catch(() => {})
await shot('2-forecast')
await page.locator('.detail-body').evaluate((el) => el.scrollBy(0, 1150))
await shot('3-charts')
await page.locator('.detail-body').evaluate((el) => el.scrollTo(0, 0))
await page.getByRole('button', { name: 'Mountain and trails' }).click()
await page.waitForSelector('.trailmap .map canvas', { timeout: 30_000 })
await page.waitForTimeout(5000)
await shot('4-trails')
await page.getByRole('button', { name: 'Back to the list' }).click()
await page.locator('#f-q').fill('')

await page.getByRole('tab', { name: 'Map' }).click()
await page.waitForSelector('.map-shell', { timeout: 30_000 })
await page.waitForFunction(() => !document.querySelector('.map-loading'), null, { timeout: 30_000 })
await page.waitForTimeout(5000)
await shot('5-map')
await browser.close()
