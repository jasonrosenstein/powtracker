// Probe: phone screenshots of how an opening date reads, in the list and on the Mountain tab.
// Usage: node scripts/probe/opening-shot.ts <baseUrl> <outDir> <search text>...
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const [base, outDir, ...queries] = process.argv.slice(2)
mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'en-US' })
const page = await ctx.newPage()
await page.goto(base, { waitUntil: 'networkidle' })
await page.screenshot({ path: `${outDir}/list.png` })
for (const [i, query] of queries.entries()) {
  await page.locator('#f-q').fill(query)
  await page.waitForTimeout(400)
  console.log(query, '→', await page.locator('.mcard-main').first().textContent(), '| tag:', await page.locator('.tag.is-season').first().textContent().catch(() => null))
  if (i === 0) await page.screenshot({ path: `${outDir}/search.png` })
  await page.locator('.mcard-main').first().click()
  await page.getByRole('button', { name: 'Mountain and trails' }).click()
  await page.waitForTimeout(5000)
  await page.screenshot({ path: `${outDir}/mountain-${i}.png` })
  await page.getByRole('button', { name: 'Back to the list' }).click()
}
await browser.close()
