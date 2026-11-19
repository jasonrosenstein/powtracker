// A minimal App Store Connect API client, for registering the app's identifier, setting up the
// subscription, and filling in the listing.
//
// Credentials stay outside the repository: ~/.appstoreconnect/powtracker.txt names the key
// (KEY_ID, ISSUER_ID, KEY_FILE), and the private key itself sits in the file it points to.
//
// Usage: node scripts/asc.mjs GET /v1/apps
//        node scripts/asc.mjs POST /v1/bundleIds body.json
//        node scripts/asc.mjs PATCH /v1/apps/123 body.json     (also DELETE)
import { createPrivateKey, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'

const config = Object.fromEntries(
  readFileSync(`${homedir()}/.appstoreconnect/powtracker.txt`, 'utf8')
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]),
)

const b64url = (data) => Buffer.from(data).toString('base64url')

/** A token good for a few minutes, signed with the team's key (ES256). */
function token() {
  const now = Math.floor(Date.now() / 1000)
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: config.KEY_ID, typ: 'JWT' }))
  const body = b64url(JSON.stringify({ iss: config.ISSUER_ID, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' }))
  const key = createPrivateKey(readFileSync(config.KEY_FILE, 'utf8'))
  const signature = sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' })
  return `${head}.${body}.${b64url(signature)}`
}

export async function asc(method, path, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: { authorization: `Bearer ${token()}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* not JSON: report the text */
  }
  return { status: res.status, ok: res.ok, json, text }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [method = 'GET', path = '/v1/apps', file] = process.argv.slice(2)
  const res = await asc(method.toUpperCase(), path, file ? JSON.parse(readFileSync(file, 'utf8')) : undefined)
  console.log(res.status)
  console.log(res.json ? JSON.stringify(res.json, null, 2).slice(0, 6000) : res.text.slice(0, 2000))
  process.exit(res.ok ? 0 : 1)
}
