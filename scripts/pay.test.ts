import { describe, expect, it } from 'vitest'
// @ts-expect-error plain JavaScript shared with the payment functions
import { entitlement, readToken, signToken } from '../pay/lib.js'

const SECRET = 'test-secret'

describe('the subscriber token', () => {
  it('names its subscription when the signature is ours', () => {
    const token = signToken('sub_123', SECRET, Date.parse('2026-11-20T00:00:00Z'))
    expect(readToken(token, SECRET)).toEqual({ sub: 'sub_123', exp: Date.parse('2026-11-23T00:00:00Z') / 1000 })
  })
  it('is refused when altered, signed with another secret, or malformed', () => {
    const token = signToken('sub_123', SECRET)
    const [payload, signature] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ sub: 'sub_999', exp: 9999999999 })).toString('base64url')
    expect(readToken(`${forged}.${signature}`, SECRET)).toBeNull()
    expect(readToken(token, 'another-secret')).toBeNull()
    expect(readToken(payload, SECRET)).toBeNull()
    expect(readToken('', SECRET)).toBeNull()
    expect(readToken(undefined, SECRET)).toBeNull()
  })
})

describe('entitlement', () => {
  process.env.TOKEN_SECRET = SECRET
  it('is Pro while trialing or active, with the day the period ends', () => {
    const e = entitlement({ id: 'sub_1', status: 'trialing', current_period_end: Date.parse('2026-11-27T00:00:00Z') / 1000 })
    expect(e.pro).toBe(true)
    expect(e.expires).toBe('2026-11-27T00:00:00.000Z')
    expect(readToken(e.token, SECRET)?.sub).toBe('sub_1')
    expect(entitlement({ id: 'sub_1', status: 'active', items: { data: [{ current_period_end: 1795000000 }] } }).pro).toBe(true)
  })
  it('is not Pro once cancelled, unpaid or past due, and hands out no token', () => {
    for (const status of ['canceled', 'unpaid', 'past_due', 'incomplete', 'incomplete_expired', 'paused']) {
      expect(entitlement({ id: 'sub_1', status, current_period_end: 1795000000 })).toEqual({ pro: false, expires: null, token: null })
    }
  })
})
