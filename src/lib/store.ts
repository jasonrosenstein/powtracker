// Where a subscription is bought and checked. In the iPhone app that is the App Store, through
// the native Subscriptions plugin (ios/App/App/SubscriptionsPlugin.swift), which verifies the
// purchase on the device. In a browser there is nothing to buy: the site shows the free plan
// and sends people to the app.
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { PRODUCT_ID } from './plan.ts'

export interface StoreStatus {
  /** An active subscription or trial was verified on this device. */
  pro: boolean
  /** The price as the App Store shows it to this person, e.g. "$2.99". Null until it loads. */
  price: string | null
  /** Days of free trial this person is still eligible for; 0 once it has been used. */
  trialDays: number
  /** When the current period ends, ISO, for a subscriber. */
  expires: string | null
}

interface SubscriptionsPlugin {
  status(options: { productId: string }): Promise<StoreStatus>
  purchase(options: { productId: string }): Promise<StoreStatus & { cancelled?: boolean; pending?: boolean }>
  restore(options: { productId: string }): Promise<StoreStatus>
  manage(): Promise<void>
  addListener(event: 'statusChanged', handler: (status: StoreStatus) => void): Promise<PluginListenerHandle>
}

const Subscriptions = registerPlugin<SubscriptionsPlugin>('Subscriptions')
const opts = { productId: PRODUCT_ID }

/** True inside the iPhone app, where the App Store can sell the subscription. */
export const canPurchase = Capacitor.isNativePlatform()

export const NO_STORE: StoreStatus = { pro: false, price: null, trialDays: 0, expires: null }

export const store = {
  status: (): Promise<StoreStatus> => (canPurchase ? Subscriptions.status(opts) : Promise.resolve(NO_STORE)),
  purchase: () => Subscriptions.purchase(opts),
  restore: () => Subscriptions.restore(opts),
  manage: () => Subscriptions.manage(),
  /** Renewals, refunds and purchases approved later arrive here. Returns the way to stop listening. */
  onChange(handler: (status: StoreStatus) => void): () => void {
    if (!canPurchase) return () => {}
    const handle = Subscriptions.addListener('statusChanged', handler)
    return () => void handle.then((h) => h.remove())
  },
}
