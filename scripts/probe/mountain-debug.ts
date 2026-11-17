// Probe: open one mountain's Mountain tab in a browser and report what rendered and what failed.
// Usage: node scripts/probe/mountain-debug.ts <baseUrl> <search text>
import { chromium } from 'playwright-core'

const [base, query] = process.argv.slice(2)
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } })
page.on('console', (m) => m.type() === 'error' && console.log('console error:', m.text().slice(0, 300)))
page.on('pageerror', (e) => console.log('page error:', String(e).slice(0, 400)))
page.on('requestfailed', (r) => console.log('request failed:', r.url().slice(0, 120), r.failure()?.errorText))
await page.goto(base, { waitUntil: 'networkidle' })
await page.locator('#f-q').fill(query)
console.log('first result:', await page.locator('.name-btn').first().textContent())
await page.locator('.name-btn').first().click()
await page.getByRole('button', { name: 'Mountain and trails' }).click()
await page.waitForTimeout(9000)
console.log('live tiles:', await page.locator('.live-tiles').count(), '| trail map canvas:', await page.locator('.trailmap .map canvas').count())
console.log('status lines:', (await page.locator('.detail .status').allTextContents()).map((t) => t.slice(0, 160)))
console.log('cards:', (await page.locator('.detail .chart-card h3').allTextContents()).join(' | '))
await browser.close()
