// Probe: print the computed colour and weight of a few elements, to debug a style by fact.
// Usage: node scripts/probe/styles.ts <baseUrl> <width> <selector> [selector...]
import { chromium } from 'playwright-core'

const [base, width, ...selectors] = process.argv.slice(2)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: Number(width), height: 900 } })
await page.goto(base, { waitUntil: 'networkidle' })
for (const sel of selectors) {
  const info = await page.locator(sel).first().evaluate((el) => {
    const s = getComputedStyle(el)
    return { text: (el.textContent ?? '').slice(0, 40), color: s.color, weight: s.fontWeight, size: s.fontSize, bg: s.backgroundColor, display: s.display }
  }).catch((e) => ({ error: String(e).slice(0, 120) }))
  console.log(sel, JSON.stringify(info))
}
await browser.close()
