// Probe: where a domain's records point, asked of public resolvers and of its own name servers,
// and what the site answers over http and https.
// Usage: node scripts/probe/domain-check.mjs <domain>
import { Resolver } from 'node:dns/promises'

const domain = process.argv[2]
const ask = async (label, servers) => {
  const r = new Resolver({ timeout: 5000, tries: 2 })
  if (servers) r.setServers(servers)
  const get = async (fn) => {
    try {
      return (await fn()).join(', ')
    } catch (e) {
      return `none (${e.code})`
    }
  }
  console.log(`${label}: NS ${await get(() => r.resolveNs(domain))}`)
  console.log(`${' '.repeat(label.length)}  A ${await get(() => r.resolve4(domain))}`)
  console.log(`${' '.repeat(label.length)}  www ${await get(() => r.resolveCname(`www.${domain}`))}`)
}

await ask('1.1.1.1', ['1.1.1.1'])
await ask('8.8.8.8', ['8.8.8.8'])
try {
  const ns = await new Resolver().resolve4('ns1.vercel-dns.com')
  await ask('ns1.vercel-dns.com', ns)
} catch (e) {
  console.log('could not reach the name server:', e.code)
}

for (const url of [`http://${domain}/`, `https://${domain}/`, `https://www.${domain}/`]) {
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) })
    const body = res.status === 200 ? await res.text() : ''
    console.log(`${url} → ${res.status}${res.headers.get('location') ? ` to ${res.headers.get('location')}` : ''}${body ? ` | title: ${body.match(/<title>([^<]*)/)?.[1]} | server: ${res.headers.get('server')}` : ''}`)
  } catch (e) {
    console.log(`${url} → failed: ${e.cause?.code ?? e.cause?.message ?? e.message}`)
  }
}
