// Renders public/icon.svg to the PNG sizes a home-screen install needs.
// Usage: node scripts/make-icons.ts
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const svg = readFileSync('public/icon.svg', 'utf8')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
for (const size of [180, 192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  await page.setContent(`<body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" style="display:block" `)}</body>`)
  await page.screenshot({ path: `public/icon-${size}.png` })
  await page.close()
  console.log(`wrote public/icon-${size}.png`)
}
await browser.close()
