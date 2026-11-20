// Starts a purchase: a Stripe Checkout page for Powtracker Pro, monthly, with the free trial.
import { endpoint, SITE, stripe, TRIAL_DAYS } from '../lib.js'

export default endpoint(async () => {
  const session = await stripe('POST', '/checkout/sessions', {
    mode: 'subscription',
    'line_items[0][price]': process.env.STRIPE_PRICE_ID,
    'line_items[0][quantity]': '1',
    'subscription_data[trial_period_days]': String(TRIAL_DAYS),
    allow_promotion_codes: 'true',
    success_url: `${SITE}/?pro_session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE}/`,
  })
  return { url: session.url }
})
