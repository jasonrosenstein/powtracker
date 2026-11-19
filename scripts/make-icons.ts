// Renders public/icon.svg to the PNG sizes a home-screen install needs.
// Usage: node scripts/make-icons.ts
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
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

// The iPhone app: its icon (a full square; iOS rounds the corners itself) and its launch image
// (the mark, centred on the icon's blue). The App Store refuses an icon with an alpha channel,
// and a browser screenshot always has one, so the icon goes through JPEG to drop it.
const IOS = 'ios/App/App/Assets.xcassets'
if (existsSync(IOS)) {
  const shot = async (size: number, body: string, path: string) => {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
    await page.setContent(body)
    await page.screenshot({ path })
    await page.close()
  }
  const sized = (px: number) => svg.replace('<svg ', `<svg width="${px}" height="${px}" style="display:block" `)
  const icon = `${IOS}/AppIcon.appiconset/AppIcon-512@2x.png`
  await shot(1024, `<body style="margin:0">${sized(1024)}</body>`, icon)
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '100', icon, '--out', `${icon}.jpg`], { stdio: 'ignore' })
  execFileSync('sips', ['-s', 'format', 'png', `${icon}.jpg`, '--out', icon], { stdio: 'ignore' })
  rmSync(`${icon}.jpg`)
  console.log(`wrote ${icon}`)
  const splash = `<body style="margin:0;height:2732px;display:grid;place-items:center;background:#1f68c1">${sized(640)}</body>`
  for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    await shot(2732, splash, `${IOS}/Splash.imageset/${name}`)
  }
  console.log(`wrote the launch images in ${IOS}/Splash.imageset`)
}
await browser.close()
