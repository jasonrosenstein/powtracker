// Check the production build. --live also opens Bear Valley's actual Trails tab.
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { BEAR_BOARD, STATUS_POLL_MS } from '../src/lib/operator-board.ts'
const base = process.argv[2] ?? 'http://127.0.0.1:4173/'
const browser = await chromium.launch({channel:'chrome',headless:true})
try {
  const page = await browser.newPage({viewport:{width:390,height:844}})
  const errors: string[] = []; page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/*open-meteo.com/**',r=>r.abort())
  let boards = 0
  page.on('request', r=>{if (r.url() === BEAR_BOARD && r.isNavigationRequest()) boards++})
  const real = process.argv.includes('--live')
  if (!real) await page.route(BEAR_BOARD, r=>r.fulfill({contentType:'text/html',body:'<h1>Operator fixture</h1>'}))
  await page.goto(new URL('#r=f357cc18&view=mountain',base).href)
  const card = page.getByRole('region',{name:'Bear Valley operating status'})
  await card.scrollIntoViewIfNeeded()
  const widget = card.frameLocator('iframe'); assert.equal(await card.locator('iframe').getAttribute('src'),BEAR_BOARD)
  if (real) {
    await widget.locator('.page-menu a').filter({hasText:/trails/i}).click({timeout:45_000})
    await widget.getByRole('button',{name:/Frontside/}).first().waitFor()
    console.log('Bear Valley operator trails:',(await widget.locator('body').innerText()).split('+')[0].trim())
  } else await widget.getByText('Operator fixture').waitFor()
  assert(!/Due to open 21 Nov|Planned opening day was|only on its own site/.test(await page.locator('.detail').innerText()))
  const nav = page.waitForRequest(r=>r.url()===BEAR_BOARD && r.isNavigationRequest())
  await card.getByRole('button',{name:'Reload board'}).click(); await nav
  assert(boards>=2); console.log('PASS fresh embedded board and manual reload, no expired plan')
  await page.close()

  // Simulate a lift opening during a visit: no navigation, and no weather ingestion.
  const p = await browser.newPage({viewport:{width:390,height:844}}); await p.clock.install()
  let reads=0
  await p.route('**/*',r=>{
    if (r.request().url().startsWith('https://winter.intermaps.com/soelden/data?')) {
      reads++; return r.fulfill({json:{lifts:[{status:reads===1?'closed':'open',popup:{title:'Test chair'}}]}})
    }
    return new URL(r.request().url()).origin===new URL(base).origin ? r.continue() : r.abort()
  })
  await p.goto(new URL('#r=78e5f98d&view=mountain',base).href)
  await p.getByRole('heading',{name:'No lifts reporting open'}).waitFor()
  assert.equal(reads,1)
  await p.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'))})
  await p.clock.fastForward(STATUS_POLL_MS+100); assert.equal(reads,1)
  await p.evaluate(()=>{Reflect.deleteProperty(document,'hidden');document.dispatchEvent(new Event('visibilitychange'))})
  await p.getByRole('heading',{name:'Lifts reporting open',exact:true}).waitFor(); assert.equal(reads,2)
  const next = p.waitForResponse(r=>r.url().startsWith('https://winter.intermaps.com/soelden/data?'))
  await p.clock.fastForward(STATUS_POLL_MS+100); await next; assert.equal(reads,3)
  assert.deepEqual(errors,[]); console.log('PASS no polling in background, catch-up on return, and automatic five-minute refresh')
} finally {await browser.close()}
