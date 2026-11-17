// Probe: wait until Open-Meteo stops rate-limiting this network, then exit 0.
// Usage: node scripts/probe/wait-api.mjs [maxMinutes]
const maxMs = Number(process.argv[2] ?? 60) * 60_000
const url = 'https://api.open-meteo.com/v1/forecast?latitude=46.1&longitude=7.23&hourly=temperature_2m&forecast_days=1'
const started = Date.now()
for (;;) {
  let status = 0
  try {
    status = (await fetch(url, { signal: AbortSignal.timeout(20_000) })).status
  } catch {
    status = -1
  }
  const stamp = new Date().toISOString().slice(11, 16)
  if (status === 200) {
    console.log(`${stamp} UTC: Open-Meteo is answering again`)
    process.exit(0)
  }
  if (Date.now() - started > maxMs) {
    console.log(`${stamp} UTC: still HTTP ${status} after ${process.argv[2] ?? 60} minutes`)
    process.exit(1)
  }
  await new Promise((r) => setTimeout(r, 30_000))
}
