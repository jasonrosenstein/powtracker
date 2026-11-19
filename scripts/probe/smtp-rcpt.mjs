// Probe: will a domain's mail server accept mail for an address? Talks SMTP as far as RCPT TO,
// then quits without sending anything, and prints each reply.
// Usage: node scripts/probe/smtp-rcpt.mjs <address>
import { resolveMx } from 'node:dns/promises'
import net from 'node:net'

const address = process.argv[2]
const domain = address.split('@')[1]
const mx = (await resolveMx(domain)).sort((a, b) => a.priority - b.priority)
console.log('mail servers:', mx.map((m) => `${m.exchange} (${m.priority})`).join(', '))

const socket = net.connect({ host: mx[0].exchange, port: 25, timeout: 20_000 })
const steps = ['EHLO probe.powtracker.app', `MAIL FROM:<probe@${domain}>`, `RCPT TO:<${address}>`, 'QUIT']
let buffer = ''
socket.on('data', (chunk) => {
  buffer += chunk
  // A reply ends with a line whose code is followed by a space, not a dash.
  const lines = buffer.split('\r\n').filter(Boolean)
  if (!lines.length || !/^\d{3} /.test(lines[lines.length - 1])) return
  console.log(lines[lines.length - 1].slice(0, 160))
  buffer = ''
  const next = steps.shift()
  if (next) {
    console.log(`> ${next}`)
    socket.write(`${next}\r\n`)
  } else socket.end()
})
socket.on('timeout', () => { console.log('no answer on port 25 (outbound mail ports are often blocked on home networks)'); socket.destroy() })
socket.on('error', (e) => console.log('connection failed:', e.code ?? e.message))
