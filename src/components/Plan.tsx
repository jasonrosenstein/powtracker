// Who has Powtracker Pro, and the sheet that sells it.
//
// The paywall is in force in the iPhone app, in a build made with VITE_PAYWALL=on, and for one
// browser tab opened with ?paywall=on (a preview of the free plan). Anywhere else everything is
// unlocked and none of this shows.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { FEATURE_PITCH, LIST_PRICE, PRO_BENEFITS, TRIAL_DAYS, type Feature, type Plan } from '../lib/plan.ts'
import { canPurchase, NO_STORE, seller, store, type StoreStatus } from '../lib/store.ts'
import { IconCheck, IconClose, Logo } from './icons.tsx'

const SITE = 'https://powtracker.app'
/** The app's App Store page, once it has one. */
const APP_STORE_URL: string | undefined = import.meta.env.VITE_APP_STORE_URL

function paywallInForce(): boolean {
  // Pro is sold only where a build asks for it: VITE_PAYWALL=on (the iPhone app, when it sells
  // Pro) or VITE_PAY_URL (the website, through Stripe). Without either, everything is free.
  if (import.meta.env.VITE_PAYWALL === 'on' || seller === 'web') return true
  try {
    const asked = new URLSearchParams(location.search).get('paywall')
    if (asked === 'on' || asked === 'off') sessionStorage.setItem('pow:paywall', asked)
    return sessionStorage.getItem('pow:paywall') === 'on'
  } catch {
    return false
  }
}

/** The last verified subscription, so a subscriber's app opens unlocked before the store answers. */
function remembered(): StoreStatus {
  try {
    const s = JSON.parse(localStorage.getItem('pow:pro') ?? 'null') as StoreStatus | null
    if (s?.pro && s.expires && Date.parse(s.expires) > Date.now()) return s
  } catch {
    /* no memory of one */
  }
  return NO_STORE
}

export interface PlanApi {
  /** Whether Pro is sold here. When false, everything is unlocked. */
  paywall: boolean
  plan: Plan
  /** Open the paywall, opening on what the person was reaching for. */
  ask: (feature?: Feature) => void
}

const PlanContext = createContext<PlanApi>({ paywall: false, plan: 'pro', ask: () => {} })
export const usePlan = () => useContext(PlanContext)

export function PlanProvider({ children }: { children: ReactNode }) {
  const paywall = useMemo(paywallInForce, [])
  const [status, setStatus] = useState<StoreStatus>(() => (paywall && canPurchase ? remembered() : NO_STORE))
  const [checked, setChecked] = useState(!canPurchase)
  const [sheet, setSheet] = useState<Feature | 'intro' | 'account' | null>(null)

  const apply = useCallback((next: StoreStatus) => {
    setStatus(next)
    try {
      if (next.pro) localStorage.setItem('pow:pro', JSON.stringify(next))
      else localStorage.removeItem('pow:pro')
    } catch {
      /* not remembered, still applied */
    }
  }, [])

  useEffect(() => {
    if (!paywall || !canPurchase) return
    store.status().then(apply, () => {}).finally(() => setChecked(true))
    return store.onChange(apply)
  }, [paywall, apply])

  // The first time someone opens the app they are offered the trial once, and can decline.
  useEffect(() => {
    if (!paywall || !checked || status.pro) return
    try {
      if (localStorage.getItem('pow:offered')) return
      localStorage.setItem('pow:offered', '1')
    } catch {
      return
    }
    setSheet('intro')
  }, [paywall, checked, status.pro])

  const plan: Plan = !paywall || status.pro ? 'pro' : 'free'
  const api = useMemo<PlanApi>(() => ({ paywall, plan, ask: (feature) => setSheet(plan === 'pro' ? 'account' : (feature ?? 'intro')) }), [paywall, plan])

  return (
    <PlanContext.Provider value={api}>
      {children}
      {paywall && sheet && <Paywall reason={sheet} status={status} onStatus={apply} onClose={() => setSheet(null)} />}
    </PlanContext.Provider>
  )
}

/** The topbar's way in: "Try Pro" for the free plan, a quiet badge for a subscriber. */
export function ProButton() {
  const { paywall, plan, ask } = usePlan()
  if (!paywall) return null
  return (
    <button type="button" className={plan === 'pro' ? 'pro-btn is-pro' : 'pro-btn'} onClick={() => ask()}>
      {plan === 'pro' ? 'Pro' : 'Try Pro'}
    </button>
  )
}

function Paywall({ reason, status, onStatus, onClose }: { reason: Feature | 'intro' | 'account'; status: StoreStatus; onStatus: (s: StoreStatus) => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  const price = status.price ?? LIST_PRICE
  // In a browser nobody has used the trial; in the app the App Store says who still may.
  const trial = canPurchase ? status.trialDays : TRIAL_DAYS
  const pitch = reason === 'intro' || reason === 'account' ? null : FEATURE_PITCH[reason]

  const run = async (what: 'purchase' | 'restore') => {
    setBusy(true)
    setMessage('')
    try {
      const result = await store[what]()
      onStatus(result)
      if (result.pro) onClose()
      else if ('pending' in result && result.pending) setMessage('The purchase is waiting for approval. Pro unlocks as soon as it is approved.')
      else if (what === 'restore') setMessage('No Powtracker Pro subscription was found for this Apple Account.')
    } catch (e) {
      setMessage(`${seller === 'apple' ? 'The App Store' : 'The payment page'} could not complete that:${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="scrim is-sheet" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet paywall" role="dialog" aria-modal="true" aria-label="Powtracker Pro">
        <div className="sheet-head">
          <Logo size={26} />
          <h2>Powtracker Pro</h2>
          <button type="button" className="icon-btn is-round" aria-label="Close" onClick={onClose}><IconClose /></button>
        </div>
        <div className="sheet-body">
          {status.pro ? (
            <>
              <p className="pay-lead"><b>You have Powtracker Pro.</b> {status.expires ? `It renews on ${new Date(status.expires).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}.` : ''}</p>
              <p className="pay-terms">{seller === 'apple' ? "Change or cancel it in your Apple Account's subscriptions." : 'Change the card or cancel at any time with the button below.'}</p>
              {store.link() && (
                <p className="pay-terms">
                  <b>Your Pro link.</b> Pro is remembered in this browser. To unlock it on another device, or after clearing your browser, open this link there, and keep a copy of it:{' '}
                  <button type="button" className="link-btn" onClick={() => void navigator.clipboard.writeText(store.link()!).then(() => setMessage('Link copied.'), () => setMessage(store.link()!))}>Copy my Pro link</button>
                </p>
              )}
            </>
          ) : (
            <>
              {pitch ? <p className="pay-lead"><b>{pitch.title}.</b> {pitch.body}</p> : <p className="pay-lead"><b>Know where it will snow before you book.</b> The free forecast covers the next 3 days. Pro covers the next two weeks, top to bottom.</p>}
              <ul className="pay-list">
                {PRO_BENEFITS.map((line) => <li key={line}><IconCheck /> {line}</li>)}
              </ul>
              <p className="pay-price">
                {trial > 0 ? <><b>{trial} days free</b>, then {price} a month.</> : <><b>{price} a month.</b></>} Cancel any time.
              </p>
            </>
          )}
          {message && <p className="notice" role="status">{message}</p>}
        </div>
        <div className="sheet-foot">
          {status.pro ? (
            canPurchase && <button type="button" className="primary-btn" onClick={() => void store.manage()}>Manage subscription</button>
          ) : canPurchase ? (
            <button type="button" className="primary-btn" disabled={busy} onClick={() => void run('purchase')}>
              {busy ? 'One moment…' : trial > 0 ? `Start ${trial}-day free trial` : `Subscribe for ${price} a month`}
            </button>
          ) : APP_STORE_URL ? (
            <a className="primary-btn" href={APP_STORE_URL} target="_blank" rel="noreferrer">Get Powtracker for iPhone</a>
          ) : (
            <p className="pay-terms">Pro is sold in the Powtracker iPhone app, which is on its way to the App Store.</p>
          )}
          {!status.pro && <button type="button" className="ghost-btn pay-later" onClick={onClose}>Not now</button>}
          <p className="pay-terms">
            {!status.pro && seller === 'apple' && <>The subscription renews each month at {price} until cancelled in your Apple Account's subscriptions, at least a day before the period ends. </>}
            {!status.pro && seller === 'web' && <>You pay by card on Stripe's secure page. The subscription renews each month at {price} until you cancel, which you can do here at any time. </>}
            {seller === 'apple' && <><button type="button" className="link-btn" disabled={busy} onClick={() => void run('restore')}>Restore purchases</button> · </>}
            <a href={`${SITE}/terms.html`} target="_blank" rel="noreferrer">Terms of use</a> · <a href={`${SITE}/privacy.html`} target="_blank" rel="noreferrer">Privacy policy</a>
          </p>
        </div>
      </div>
    </div>
  )
}
