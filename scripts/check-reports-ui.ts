// Check the built page on a phone and desktop against its actual collected report file.
// Run with node scripts/check-reports-ui.ts http://127.0.0.1:4173/
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { reportAge, reportLabels, showAmount, type ReportFile, type ReportMetric } from '../src/lib/reports.ts'
const base=process.argv[2]??'http://127.0.0.1:4173/'
const file:ReportFile=await (await fetch(new URL('data/reports.json',base))).json()
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
  for (const width of [390,1280]) {
    const ctx=await browser.newContext({viewport:{width,height:850},locale:'en-US'})
    // Make the model services unavailable: the source-backed card must not depend on them.
    await ctx.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin ? route.continue() : route.abort())
    for (const id of ['88a22ba2','2badaaea','10910feb']) {
      const page=await ctx.newPage(), report=file.resorts[id]?.[0]
      assert(report,`No collected report for test mountain ${id}`)
      await page.goto(base+'#r='+id)
      const card=page.getByRole('region',{name:'Published mountain report'})
      await card.waitFor()
      assert.equal(await card.locator('a').first().getAttribute('href'),report.url)
      const reading=report.readings[0], first=(Object.keys(reportLabels) as ReportMetric[]).find(k=>reading.values[k])!
      assert.equal(await card.locator('.measured strong').innerText(),showAmount(first,reading.values[first]!,'imperial'))
      if(reading.sky) assert((await card.innerText()).includes(`Reported weather: ${reading.sky}`))
      if(reading.surface) assert((await card.innerText()).includes(`Surface: ${reading.surface}`))
      if(reading.values.depth) {
        await card.locator('summary').click()
        assert((await card.locator('dl').first().innerText()).includes('Snow depth'))
      }
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow')
      console.log(`PASS ${width}px ${id}: ${first}, attribution, independent of model network`)
      await page.close()
    }
    const list=await ctx.newPage(); await list.goto(base)
    await list.getByRole('checkbox',{name:/Only mountains with a resort report/}).check()
    const count=Object.values(file.resorts).filter(items=>items.some(r=>r.kind==='operator'&&r.readings.some(x=>reportAge(x.at)==='recent'))).length
    assert.equal(await list.locator('.summary b').first().innerText(),String(count))
    console.log(`PASS ${width}px ranking filter: ${count} recently reporting mountains`)
    await ctx.close()
  }
} finally {await browser.close()}
