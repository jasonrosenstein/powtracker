// Probe: does Open-Meteo keep a connection open across the gap the ingest leaves between
// batches? Makes three small requests <gap> seconds apart over one keep-alive agent and reports
// whether each reused the socket. Costs three API calls.
// Usage: node scripts/probe/keepalive.mjs [gapSeconds]
import https from 'node:https'

const gap = Number(process.argv[2] ?? 8) * 1000
const agent = new https.Agent({ keepAlive: true, maxSockets: 1 })
const url = 'https://api.open-meteo.com/v1/forecast?latitude=46.0&longitude=7.0&hourly=temperature_2m&forecast_days=1'

function get() {
  return new Promise((resolve, reject) => {
    const t0 = Date.now()
    const req = https.get(url, { agent, headers: { 'accept-encoding': 'gzip' } }, (res) => {
      res.resume()
      res.on('end', () => resolve({ status: res.statusCode, reused: req.reusedSocket, ms: Date.now() - t0, keepAlive: res.headers['keep-alive'], connection: res.headers.connection, encoding: res.headers['content-encoding'], http: res.httpVersion }))
    })
    req.on('error', reject)
  })
}

for (let i = 0; i < 3; i++) {
  console.log(await get())
  if (i < 2) await new Promise((r) => setTimeout(r, gap))
}
agent.destroy()
