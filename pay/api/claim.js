// After Checkout: exchanges the finished session for the token the browser keeps.
import { endpoint, entitlement, stripe } from '../lib.js'

export default endpoint(async (req) => {
  const id = String(req.query.session ?? '')
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) throw new Error('not a checkout session')
  const session = await stripe('GET', `/checkout/sessions/${id}`)
  if (session.status !== 'complete' || !session.subscription) return { pro: false, expires: null, token: null }
  return entitlement(await stripe('GET', `/subscriptions/${session.subscription}`))
})
