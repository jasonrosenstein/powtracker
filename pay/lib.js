// Shared by the payment functions: talking to Stripe, signing the token a subscriber's browser
// keeps, and answering the site across origins. Secrets come from the environment:
//   STRIPE_SECRET_KEY   the Stripe account's secret key
//   STRIPE_PRICE_ID     the $2.99 monthly price
//   TOKEN_SECRET        any long random string; signs the tokens
import { createHmac, timingSafeEqual } from 'node:crypto'

export const SITE = process.env.SITE_URL || 'https://powtracker.app'
export const TRIAL_DAYS = 7
/** A token is good for this long without asking Stripe again. */
const TOKEN_DAYS = 3

/** Call the Stripe API with form-encoded parameters ({ 'a[b]': 'c' }). */
export async function stripe(method, path, params) {
  const body = params ? new URLSearchParams(params).toString() : undefined
  const res = await fetch(`https://api.stripe.com/v1${path}${method === 'GET' && body ? `?${body}` : ''}`, {
    method,
    headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, ...(method !== 'GET' && body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
    body: method === 'GET' ? undefined : body,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message ?? `Stripe answered ${res.status}`)
  return json
}

const b64 = (data) => Buffer.from(data).toString('base64url')
const mac = (payload, secret) => createHmac('sha256', secret).update(payload).digest('base64url')

/** A signed note of which subscription this browser paid for. */
export function signToken(subscriptionId, secret = process.env.TOKEN_SECRET, nowMs = Date.now()) {
  const payload = b64(JSON.stringify({ sub: subscriptionId, exp: Math.floor(nowMs / 1000) + TOKEN_DAYS * 86400 }))
  return `${payload}.${mac(payload, secret)}`
}

/** The subscription a token names, or null when the signature is not ours. Expiry is the caller's to judge. */
export function readToken(token, secret = process.env.TOKEN_SECRET) {
  const [payload, signature] = String(token ?? '').split('.')
  if (!payload || !signature) return null
  const want = Buffer.from(mac(payload, secret))
  const got = Buffer.from(signature)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  try {
    const { sub, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return typeof sub === 'string' ? { sub, exp } : null
  } catch {
    return null
  }
}

/** What the site needs to know about a subscription. */
export function entitlement(subscription) {
  const pro = subscription.status === 'active' || subscription.status === 'trialing'
  const end = subscription.current_period_end ?? subscription.items?.data?.[0]?.current_period_end ?? subscription.trial_end
  return { pro, expires: pro && end ? new Date(end * 1000).toISOString() : null, token: pro ? signToken(subscription.id) : null }
}

/** Wrap a handler: allow the site to call it, answer preflights, and turn errors into JSON. */
export function endpoint(handler) {
  return async (req, res) => {
    res.setHeader('access-control-allow-origin', SITE)
    res.setHeader('access-control-allow-headers', 'content-type')
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
    res.setHeader('cache-control', 'no-store')
    if (req.method === 'OPTIONS') return res.status(204).end()
    try {
      res.status(200).json(await handler(req))
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : String(e) })
    }
  }
}
