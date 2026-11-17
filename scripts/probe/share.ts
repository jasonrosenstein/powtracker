// Probe: what the share button does in desktop Chrome (share sheet, clipboard, or neither).
import { chromium } from 'playwright-core'

const base = process.argv[2] ?? 'http://127.0.0.1:4173/'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } })
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'])
const page = await ctx.newPage()
page.on('console', (m) => console.log('console:', m.type(), m.text().slice(0, 200)))
await page.goto(base, { waitUntil: 'networkidle' })
console.log(await page.evaluate(() => ({ share: typeof navigator.share, clipboard: typeof navigator.clipboard?.writeText, secure: isSecureContext })))
await page.locator('.name-btn').first().click()
await page.waitForSelector('.detail .daystrip')
await page.getByRole('button', { name: /^Share the/ }).click()
await page.waitForTimeout(1500)
console.log('toast:', await page.locator('.toast').allTextContents())
await browser.close()
