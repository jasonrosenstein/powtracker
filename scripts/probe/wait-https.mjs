// Probe: wait until a host serves a valid certificate for a domain, then report who issued it.
// Connects to the given address directly, so a stale local DNS cache does not matter.
// Usage: node scripts/probe/wait-https.mjs <domain> <ip> [minutes to keep trying]
import https from 'node:https'

const [domain, ip, minutes = '9'] = process.argv.slice(2)
const deadline = Date.now() + Number(minutes) * 60_000

function once() {
  return new Promise((resolve) => {
    const req = https.get({ host: ip, servername: domain, headers: { host: domain }, path: '/', timeout: 15_000 }, (res) => {
      const cert = res.socket.getPeerCertificate()
      res.resume()
      resolve({ ok: true, line: `https ${res.statusCode}; certificate for ${cert.subject?.CN} (${cert.subjectaltname}), issued by ${cert.issuer?.O}, valid to ${cert.valid_to}` })
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', (e) => resolve({ ok: false, line: `not yet: ${e.code ?? e.message}` }))
  })
}

for (;;) {
  const { ok, line } = await once()
  if (ok || Date.now() >= deadline) {
    console.log(new Date().toISOString().slice(11, 19), 'UTC', line)
    process.exit(ok ? 0 : 1)
  }
  await new Promise((r) => setTimeout(r, 30_000))
}
