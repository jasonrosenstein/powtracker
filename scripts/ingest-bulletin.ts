// A separate news snapshot. Never collect or store the widget's authentication parameters.
import { rename, writeFile } from 'node:fs/promises'
import { bearBulletin } from './lib/operator-bulletin.ts'

const res = await fetch('https://www.bearvalley.com/blog-feed.xml',{signal:AbortSignal.timeout(15_000),redirect:'error'})
if (!res.ok || !res.body) throw Error(`Bear Valley RSS: HTTP ${res.status}`)
const chunks: Uint8Array[] = []
let bytes = 0
for await (const chunk of res.body) {
  bytes += chunk.length
  if (bytes > 2_000_000) throw Error('RSS exceeds size limit')
  chunks.push(chunk)
}
const snapshot = bearBulletin(Buffer.concat(chunks).toString('utf8'), Date.now())
const file = 'public/data/bear-valley-bulletin.json'
await writeFile(file+'.tmp',JSON.stringify(snapshot)+'\n'); await rename(file+'.tmp',file)
console.log(`Bear Valley bulletin: ${snapshot.bulletin?.posted ?? 'no dated post'}`)
