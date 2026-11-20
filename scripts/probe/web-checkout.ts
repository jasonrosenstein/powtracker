// Probe: the website's purchase flow end to end in a browser, against a stand-in for Stripe.
// The real payment functions (pay/api/*.js) run here with api.stripe.com replaced by a fake
// that completes any checkout at once. Needs the site built with
// VITE_PAY_URL=http://127.0.0.1:4190 and served at the given address.
// Usage: node scripts/probe/web-checkout.ts http://127.0.0.1:4173/
import http from 'node:http'
import { chromium } from 'playwright-core'

const site = process.argv[2] ?? 'http://127.0.0.1:4173/'
process.env.SITE_URL = site.replace(/\/$/, '')
process.env.TOKEN_SECRET = 'probe-secret'
process.env.STRIPE_SECRET_KEY = 'sk_test_probe'
process.env.STRIPE_PRICE_ID = 'price_probe'

// --- A fake Stripe: one subscription whose status the probe can change. ---
let status = 'trialing'
const calls: string[] = []
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input)
  if (!url.startsWith('https://api.stripe.com/v1')) return realFetch(input, init)
  const path = url.slice('https://api.stripe.com/v1'.length).split('?')[0]
  calls.push(`${init?.method ?? 'GET'} ${path}`)
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  if (path === '/checkout/sessions') {
    const form = new URLSearchParams(String(init?.body))
    if (form.get('subscription_data[trial_period_days]') !== '7' || form.get('line_items[0][price]') !== 'price_probe') throw new Error('checkout was not asked for the 7-day trial on the right price')
    return json({ url: form.get('success_url')!.replace('{CHECKOUT_SESSION_ID}', 'cs_test_probe') })
  }
  if (path === '/checkout/sessions/cs_test_probe') return json({ status: 'complete', subscription: 'sub_probe' })
  if (path === '/subscriptions/sub_probe') return json({ id: 'sub_probe', customer: 'cus_probe', status, current_period_end: Math.floor(Date.now() / 1000) + 7 * 86400 })
  if (path === '/billing_portal/sessions') return json({ url: `${process.env.SITE_URL}/?portal=visited` })
  return new Response(JSON.stringify({ error: { message: `fake Stripe has no ${path}` } }), { status: 404 })
}) as typeof fetch

const handlers: Record<string, (req: unknown, res: unknown) => Promise<void>> = {
  // @ts-expect-error plain JavaScript
  '/api/checkout': (await import('../../pay/api/checkout.js')).default,
  // @ts-expect-error plain JavaScript
  '/api/claim': (await import('../../pay/api/claim.js')).default,
  // @ts-expect-error plain JavaScript
  '/api/status': (await import('../../pay/api/status.js')).default,
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url!, 'http://x')
  const handler = handlers[url.pathname]
  if (!handler) return void res.writeHead(404).end()
  // The two things Vercel adds to Node's request and response.
  const vres = Object.assign(res, { status: (code: number) => ((res.statusCode = code), vres), json: (body: unknown) => (res.setHeader('content-type', 'application/json'), res.end(JSON.stringify(body))) })
  void handler(Object.assign(req, { query: Object.fromEntries(url.searchParams), body: {} }), vres)
}).listen(4190, '127.0.0.1')

let failed = 0
const check = (ok: boolean, what: string) => (console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`), ok || failed++)

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage()
page.on('pageerror', (e) => console.log('page error:', String(e).slice(0, 200)))
await page.goto(site, { waitUntil: 'networkidle' })
await page.waitForSelector('.paywall')
const offer = (await page.locator('.paywall').textContent())!
check(/7 days free, then \$2\.99 a month/.test(offer) && offer.includes("Stripe's secure page") && !offer.includes('Apple'), 'the offer states the trial, the price and card payment, with no mention of Apple')
await page.getByRole('button', { name: 'Start 7-day free trial' }).click()
await page.waitForURL((u) => !u.search.includes('pro_session'), { timeout: 15_000 })
await page.waitForSelector('.pro-btn.is-pro', { timeout: 15_000 })
check(true, 'after checkout the visitor returns as Pro, and the session id is gone from the address')
check((await page.locator('.lock').count()) === 0, 'nothing is locked')
await page.locator('.period').getByRole('button', { name: '14 days' }).click()
check((await page.locator('.period button[aria-pressed=true]').textContent())!.includes('14 days'), 'the 14-day forecast opens')

await page.reload({ waitUntil: 'networkidle' })
check((await page.locator('.pro-btn.is-pro').count()) === 1, 'Pro survives a reload')
await page.locator('.pro-btn').click()
check((await page.locator('.paywall').textContent())!.includes('You have Powtracker Pro'), 'the Pro button shows the subscription')
const link = await page.evaluate(() => `${location.origin}${location.pathname}?pro=${encodeURIComponent(localStorage.getItem('pow:token')!)}`)
await page.getByRole('button', { name: 'Manage subscription' }).click()
await page.waitForURL(/portal=visited/, { timeout: 15_000 })
check(calls.includes('POST /billing_portal/sessions'), '"Manage subscription" leaves for the billing page')

const other = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
await other.goto(link, { waitUntil: 'networkidle' })
check((await other.locator('.pro-btn.is-pro').count()) === 1 && !other.url().includes('pro='), 'the personal Pro link unlocks another browser')

status = 'canceled'
await other.reload({ waitUntil: 'networkidle' })
check((await other.locator('.pro-btn:not(.is-pro)').count()) === 1 && (await other.evaluate(() => localStorage.getItem('pow:token'))) === null, 'a cancelled subscription locks the site again and forgets the token')
const forged = await (await browser.newContext()).newPage()
await forged.goto(`${site}?pro=${Buffer.from('{"sub":"sub_probe","exp":9999999999}').toString('base64url')}.forged`, { waitUntil: 'networkidle' })
check((await forged.locator('.pro-btn.is-pro').count()) === 0, 'a forged link unlocks nothing')

await browser.close()
server.close()
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed')
process.exit(failed ? 1 : 0)
