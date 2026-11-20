// Connects the payment service to a Stripe account: creates the Powtracker Pro product and its
// $2.99 monthly price if they do not exist, stores the key and the price in the service's
// environment on Vercel, and redeploys it. The key is read from a file outside the repository
// and is never printed. Usage: node scripts/pay-setup.mjs
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'

const key = readFileSync(`${homedir()}/.config/powtracker/stripe-key.txt`, 'utf8').trim()
if (!/^sk_(live|test)_/.test(key)) throw new Error('the file does not hold a Stripe secret key (sk_live_… or sk_test_…)')
const mode = key.startsWith('sk_live_') ? 'live' : 'test'

async function stripe(method, path, params) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: params ? new URLSearchParams(params) : undefined,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`Stripe: ${json.error?.message}`)
  return json
}

const account = await stripe('GET', '/account')
console.log(`Stripe account (${mode} mode): charges ${account.charges_enabled ? 'enabled' : 'NOT enabled yet'}, payouts ${account.payouts_enabled ? 'enabled' : 'NOT enabled yet'}`)

// Find the price by its lookup key, so running this twice does not make a second product.
const found = await stripe('GET', '/prices?lookup_keys[]=powtracker_pro_monthly&active=true')
let price = found.data[0]
if (!price) {
  const product = await stripe('POST', '/products', { name: 'Powtracker Pro', description: 'The 14-day snow outlook, base and summit forecasts, pass filters and more.' })
  price = await stripe('POST', '/prices', { product: product.id, currency: 'usd', unit_amount: '299', 'recurring[interval]': 'month', lookup_key: 'powtracker_pro_monthly' })
  console.log('created the product and its $2.99 monthly price')
} else {
  console.log('the $2.99 monthly price already exists')
}

const vercel = (args, input) => execFileSync('vercel', [...args, '--cwd', 'pay'], { input, stdio: ['pipe', 'pipe', 'pipe'] }).toString()
for (const [name, value] of [['STRIPE_SECRET_KEY', key], ['STRIPE_PRICE_ID', price.id]]) {
  try {
    vercel(['env', 'rm', name, 'production', '--yes'])
  } catch {
    /* not set yet */
  }
  vercel(['env', 'add', name, 'production'], value)
}
vercel(['deploy', '--prod', '--yes'])
console.log('the payment service is redeployed with the key')

const check = await fetch('https://pay.powtracker.app/api/checkout', { method: 'POST' }).then((r) => r.json())
console.log(check.url ? 'checkout starts: the service is ready' : `checkout failed: ${check.error}`)
