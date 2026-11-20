// Where a subscription is bought and checked.
//   In the iPhone app: the App Store, through the native Subscriptions plugin
//   (ios/App/App/SubscriptionsPlugin.swift), which verifies the purchase on the device.
//   On the website: Stripe Checkout, through the small payment service in pay/ (set its address
//   in VITE_PAY_URL). The browser keeps a signed token and re-checks it against Stripe.
// With neither, there is nothing to buy and the site shows the free plan.
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { PRODUCT_ID, TRIAL_DAYS } from './plan.ts'

export interface StoreStatus {
  /** An active subscription or trial was verified. */
  pro: boolean
  /** The price as the App Store shows it to this person, e.g. "$2.99". Null until it loads, and on the web. */
  price: string | null
  /** Days of free trial this person is still eligible for; 0 once it has been used. */
  trialDays: number
  /** When the current period ends, ISO, for a subscriber. */
  expires: string | null
}
export type PurchaseResult = StoreStatus & { cancelled?: boolean; pending?: boolean }

interface SubscriptionsPlugin {
  status(options: { productId: string }): Promise<StoreStatus>
  purchase(options: { productId: string }): Promise<PurchaseResult>
  restore(options: { productId: string }): Promise<StoreStatus>
  manage(): Promise<void>
  addListener(event: 'statusChanged', handler: (status: StoreStatus) => void): Promise<PluginListenerHandle>
}

const Subscriptions = registerPlugin<SubscriptionsPlugin>('Subscriptions')
const opts = { productId: PRODUCT_ID }
const PAY_URL: string | undefined = import.meta.env.VITE_PAY_URL

/** Who sells Pro here: Apple in the iPhone app, Stripe on the website, nobody otherwise. */
export const seller: 'apple' | 'web' | null = Capacitor.isNativePlatform() ? 'apple' : PAY_URL ? 'web' : null
export const canPurchase = seller !== null

export const NO_STORE: StoreStatus = { pro: false, price: null, trialDays: 0, expires: null }

// --- The website's side ---------------------------------------------------------------------------
const TOKEN_KEY = 'pow:token'
const readToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}
const keepToken = (token: string | null) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage is unavailable: Pro lasts for this visit */
  }
}

interface PayAnswer { pro: boolean; expires: string | null; token: string | null; portal?: string; url?: string; error?: string }
async function pay(path: string, init?: RequestInit): Promise<PayAnswer> {
  const res = await fetch(`${PAY_URL}${path}`, init)
  const answer = (await res.json()) as PayAnswer
  if (!res.ok) throw new Error(answer.error ?? `the payment service answered ${res.status}`)
  return answer
}
const asStatus = (a: PayAnswer): StoreStatus => ({ pro: a.pro, price: null, trialDays: a.pro ? 0 : TRIAL_DAYS, expires: a.expires })

/** The token this visit should use: one just earned at checkout, one in a personal link, or the saved one. */
function arrivingToken(): { session?: string; token: string | null } {
  const params = new URLSearchParams(location.search)
  const session = params.get('pro_session') ?? undefined
  const linked = params.get('pro')
  if (session || linked) {
    params.delete('pro_session')
    params.delete('pro')
    const rest = params.toString()
    history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : '') + location.hash)
  }
  if (linked) keepToken(linked)
  return { session, token: readToken() }
}

const web = {
  async status(): Promise<StoreStatus> {
    const { session, token } = arrivingToken()
    if (!session && !token) return { ...NO_STORE, trialDays: TRIAL_DAYS }
    const answer = await pay(session ? `/api/claim?session=${encodeURIComponent(session)}` : `/api/status?token=${encodeURIComponent(token!)}`)
    // A lapsed or cancelled subscription clears the token; a live one renews it.
    if (answer.token || !answer.pro) keepToken(answer.token)
    return asStatus(answer)
  },
  /** Leaves for Stripe's checkout page; the visitor comes back with ?pro_session=…. */
  async purchase(): Promise<PurchaseResult> {
    const { url } = await pay('/api/checkout', { method: 'POST' })
    if (!url) throw new Error('checkout could not be started')
    location.href = url
    return new Promise(() => {})
  },
  /** Leaves for Stripe's page for changing the card or cancelling. */
  async manage(): Promise<void> {
    const token = readToken()
    if (!token) throw new Error('no subscription is saved in this browser')
    const { portal } = await pay(`/api/status?portal=1&token=${encodeURIComponent(token)}`)
    if (portal) location.href = portal
  },
  /** A link that unlocks Pro in another browser or device. */
  link: (): string | null => (readToken() ? `${location.origin}${location.pathname}?pro=${encodeURIComponent(readToken()!)}` : null),
}

export const store = {
  status: (): Promise<StoreStatus> => (seller === 'apple' ? Subscriptions.status(opts) : seller === 'web' ? web.status() : Promise.resolve(NO_STORE)),
  purchase: (): Promise<PurchaseResult> => (seller === 'apple' ? Subscriptions.purchase(opts) : web.purchase()),
  /** App Store only: the web has no account to restore from; a subscriber's personal link does that job. */
  restore: (): Promise<StoreStatus> => (seller === 'apple' ? Subscriptions.restore(opts) : web.status()),
  manage: (): Promise<void> => (seller === 'apple' ? Subscriptions.manage() : web.manage()),
  link: (): string | null => (seller === 'web' ? web.link() : null),
  /** Renewals, refunds and purchases approved later arrive here. Returns the way to stop listening. */
  onChange(handler: (status: StoreStatus) => void): () => void {
    if (seller !== 'apple') return () => {}
    const handle = Subscriptions.addListener('statusChanged', handler)
    return () => void handle.then((h) => h.remove())
  },
}
