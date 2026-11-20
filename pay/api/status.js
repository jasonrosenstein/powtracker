// Checks a browser's token against Stripe: still subscribed? Answers with a fresh token if so.
// With { portal: true } it also returns a link to Stripe's page for changing or cancelling.
import { endpoint, entitlement, readToken, SITE, stripe } from '../lib.js'

export default endpoint(async (req) => {
  const token = readToken(req.query.token ?? req.body?.token)
  if (!token) return { pro: false, expires: null, token: null }
  const subscription = await stripe('GET', `/subscriptions/${token.sub}`)
  const answer = entitlement(subscription)
  if (req.query.portal) {
    const portal = await stripe('POST', '/billing_portal/sessions', { customer: subscription.customer, return_url: `${SITE}/` })
    answer.portal = portal.url
  }
  return answer
})
