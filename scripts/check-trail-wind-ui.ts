// Exercise the built map in Chrome: optionally pass --live for real current wind rather than
// the known west/strong north/calm/missing test hours. A live calm hour won't show particles.
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import type { TrailsFile } from '../src/lib/types.ts'

const base = process.argv[2] ?? 'http://127.0.0.1:4173/'
const live = process.argv.includes('--live')
const browser = await chromium.launch({channel:'chrome',headless:true})
try {
  const page = await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,colorScheme:process.argv.includes('--dark')?'dark':'light'})
  if (!live) {
    // Regression: a matched feed with no open runs used to turn the entire mountain grey.
    const file:TrailsFile = await (await fetch(new URL('data/trails/78e5f98d.json',base))).json()
    const slopes = file.r.map(run=>({status:'closed',popup:{title:run[0],number:run[7]}}))
    await page.route('https://winter.intermaps.com/soelden/data?*',route=>route.fulfill({json:{slopes}}))
  }
  const errors:string[] = []
  page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/*open-meteo.com/**', route=>{
    if (!route.request().url().includes('wind_speed_10m')) return route.abort()
    if (live) return route.continue()
    const time = Array.from({length:4},(_,i)=>new Date((Math.floor(Date.now()/3600_000)+i)*3600_000).toISOString().slice(0,16))
    const cols = [1,1,1,1]
    return route.fulfill({json:{utc_offset_seconds:0,daily:{sunrise:[],sunset:[]},hourly:{time,temperature_2m:cols,apparent_temperature:cols,wind_speed_10m:[12,50,0,null],wind_gusts_10m:[20,60,0,null],wind_direction_10m:[270,0,90,null],weather_code:cols,is_day:cols,visibility:cols}}})
  })
  await page.goto(new URL(live ? '#r=53410fc6&view=wind' : '#r=78e5f98d',base).href)
  if (!live) await page.getByRole('button',{name:'Mountain and trails',exact:true}).click()
  const stage = page.locator('.trailmap-stage'), wind = stage.getByRole('button',{name:'Wind',exact:true})
  await stage.scrollIntoViewIfNeeded()
  assert.equal(await wind.getAttribute('aria-pressed'),'true')
  const streak = stage.locator('.trail-flow i').first()
  await streak.waitFor({timeout:30_000})
  await page.waitForFunction(()=>{const el=document.querySelector('.trail-flow i');return el && getComputedStyle(el).animationPlayState==='running'})
  const start = await streak.evaluate(el=>getComputedStyle(el).transform)
  await page.waitForFunction(old=>{const el=document.querySelector('.trail-flow i');return el && getComputedStyle(el).transform!==old},start)
  console.log(`PASS default on, ${await stage.locator('.trail-flow').count()} moving streaks · ${await page.locator('.trail-wind-panel strong').innerText()}`)
  if (process.argv.includes('--shot')) await stage.screenshot({path:'data/build/wind-flow-phone.png'})
  if (!live) {
    await page.getByRole('group',{name:'Trail map key'}).getByText(/not confirmed open/).waitFor()
    // Read the rendered map, not its legend or style configuration. Skip top/bottom controls.
    const pixels = await page.evaluate(async encoded=>{
      const image = new Image(); image.src=`data:image/png;base64,${encoded}`; await image.decode()
      const c=document.createElement('canvas'); c.width=image.width; c.height=image.height
      const ctx=c.getContext('2d')!; ctx.drawImage(image,0,0)
      const p=ctx.getImageData(0,55,c.width,c.height-110).data, counts=[0,0]
      for(let i=0;i<p.length;i+=4) {
        if(p[i]===42 && p[i+1]===120 && p[i+2]===214) counts[0]++ // blue run
        if(p[i]===214 && p[i+1]===64 && p[i+2]===58) counts[1]++ // red run
      }
      return counts
    },(await stage.screenshot()).toString('base64'))
    assert(pixels.every(n=>n>80),`Expected visible blue and red runs, got ${pixels} pixels`)
    console.log(`PASS closed runs retain difficulty colours under wind: ${pixels} blue/red pixels`)
    const slider = page.getByRole('slider',{name:'Trail wind forecast hour'})
    const first = await streak.evaluate(el=>parseFloat(getComputedStyle(el).animationDuration))
    assert.match(await page.locator('.trail-wind-panel').innerText(),/air moves E\b/)
    await slider.press('ArrowRight'); await page.getByText(/air moves S\b/).first().waitFor()
    assert(await streak.evaluate(el=>parseFloat(getComputedStyle(el).animationDuration))<first)
    for (const label of ['Calm','Speed unavailable']) {
      await slider.press('ArrowRight'); await page.locator('.trail-wind-panel strong').filter({hasText:label}).waitFor()
      await page.waitForFunction(()=>!document.querySelector('.trail-flow'))
    }
    await slider.press('Home'); await streak.waitFor()
    console.log('PASS forecast hour changes direction and cadence; calm and missing wind draw no flow')
  }
  await stage.getByRole('button',{name:'3D',exact:true}).click()
  await stage.getByRole('button',{name:'Full screen',exact:true}).click()
  await page.locator('.trailmap.is-full .trail-flow').first().waitFor()
  await page.locator('.trailmap.is-full').getByRole('group',{name:'Trail map key'}).getByText('Blue',{exact:true}).waitFor()
  await stage.getByRole('button',{name:'Close map',exact:true}).click()
  await page.emulateMedia({reducedMotion:'reduce'})
  assert.equal(await streak.evaluate(el=>getComputedStyle(el).animationName),'none')
  await wind.click(); await page.waitForFunction(()=>!document.querySelector('.trail-flow'))
  await wind.click(); await streak.waitFor()
  await page.getByRole('button',{name:'Back to the list'}).click()
  assert.deepEqual(errors,[])
  console.log('PASS tilt, full screen, reduced motion, hide/show, close without page errors')
} finally { await browser.close() }
