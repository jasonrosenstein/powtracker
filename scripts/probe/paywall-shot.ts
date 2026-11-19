// Probe: phone screenshots of the free plan and the paywall (opened with ?paywall=on).
// Usage: node scripts/probe/paywall-shot.ts <baseUrl> <outDir>
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const [base, outDir] = process.argv.slice(2)
mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'en-US' })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('page error:', String(e).slice(0, 300)))
await page.goto(`${base}?paywall=on`, { waitUntil: 'networkidle' })
await page.waitForSelector('.paywall')
await page.screenshot({ path: `${outDir}/1-intro.png` })
await page.getByRole('button', { name: 'Not now' }).click()
await page.screenshot({ path: `${outDir}/2-free-list.png` })
await page.locator('.period').getByRole('button', { name: /7 days/ }).click()
await page.waitForSelector('.paywall')
await page.screenshot({ path: `${outDir}/3-outlook.png` })
await page.getByRole('button', { name: 'Not now' }).click()
await page.locator('.mcard-main').first().click()
await page.waitForSelector('.daystrip')
await page.screenshot({ path: `${outDir}/4-mountain.png` })
await page.locator('.detail-body').evaluate((el) => el.scrollBy(0, 700))
await page.waitForTimeout(300)
await page.screenshot({ path: `${outDir}/5-mountain-lower.png` })
await browser.close()
