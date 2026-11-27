// One request per distinct operator report, shared by every viewer. Only public, reviewed
// sources: never crawl an arbitrary URL from the catalogue or run a resort's JavaScript.
import { readFile, rename, writeFile } from 'node:fs/promises'
import { liveFeedFor } from '../src/lib/status.ts'
import type { Resort } from '../src/lib/types.ts'
import type { PublishedReport, ReportFile } from '../src/lib/reports.ts'
import { alterraSnow, hakubaSnow, ltsReading, observatoryRain, rcrSnow, seliRain, vailSnow, type Parsed } from './lib/report-parsers.ts'

const out = 'public/data/reports.json'
const resorts: Resort[] = JSON.parse(await readFile('public/data/resorts.json','utf8')).resorts
const catalogue = new Map(resorts.map(r=>[r.id,r]))
const now = new Date().toISOString()
const snapshot: ReportFile = {version:1, generated:now, resorts:{}}
// Last-good fallback applies only on transport/format errors. A valid empty report clears it.
let previous: ReportFile | undefined
for (const file of [process.argv[2], out].filter((x): x is string=>!!x)) {
  try { const j = JSON.parse(await readFile(file,'utf8')); if (j.version===1 && j.resorts && typeof j.resorts==='object') {previous=j;break} } catch { /* first build */ }
}
async function get(url: string, encoding = 'utf-8') {
  const host = new URL(url).hostname.replace(/^www\./,'')
  const response = await fetch(url, {signal: AbortSignal.timeout(20_000),headers:{'User-Agent':'MountainReportReader/1.0'}})
  if (!response.ok || new URL(response.url).hostname.replace(/^www\./,'') !== host) throw Error(`HTTP ${response.status} or unexpected host`)
  const chunks: Uint8Array[] = []; let size = 0
  if (!response.body) throw Error('No response body')
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.length; if (size > 5_000_000) throw Error('Oversize response'); chunks.push(chunk)
  }
  return new TextDecoder(encoding).decode(Buffer.concat(chunks))
}
const jobs: (()=>Promise<void>)[] = []
let failures = 0, successful = 0
function add(ids: string[], report: PublishedReport) {
  for (const id of ids) {
    if (!catalogue.has(id)) throw Error(`Unknown mountain ${id}`)
    ;(snapshot.resorts[id] ??= []).push(report)
  }
}
function keep(ids: string[], source: string) {
  for (const id of ids) for (const r of previous?.resorts[id] ?? []) {
    if (r.source===source && Array.isArray(r.readings) && Date.parse(now)-Date.parse(r.checked)<7*86400e3) add([id],r)
  }
}
function job(ids: string[], source: string, url: string, load: ()=>Promise<Parsed>, kind: PublishedReport['kind']='operator') {
  for (const id of ids) if (!catalogue.has(id)) throw Error(`Unknown mountain ${id}`)
  jobs.push(async()=>{
    try { const report = await load(); if (report.readings.length) add(ids,{kind,source,url,checked:now,...report}); successful++ }
    catch (e) { failures++; console.warn(`${source} ${ids.join(',')}: ${(e as Error).message}`); keep(ids,source) }
  })
}
const feeds = new Map<number,string[]>()
for (const r of resorts) {const f=liveFeedFor(r); if (f?.provider==='mtnpowder') feeds.set(f.id,[...(feeds.get(f.id)??[]),r.id])}
for (const [id,ids] of feeds) {
  const url = `https://www.mtnpowder.com/feed?resortId=${id}`
  job(ids,'Resort snow report · Mountain Powder',url,async()=>{const j=JSON.parse(await get(url)); if (!j.SnowReport) throw Error('Missing SnowReport'); return alterraSnow(j)})
}
// Audited one-to-one destinations. Do not assign shared BMBW or Jack Frost/Big Boulder pages
// to either constituent mountain without a reading identified for that mountain.
const vail: Record<string,string> = {
  '88a22ba2':'vail.com','1185f091':'beavercreek.com','19291bcc':'whistlerblackcomb.com','27206747':'breckenridge.com',
  '3f61859b':'skiheavenly.com','3dad9d62':'parkcitymountain.com','7d855b81':'keystoneresort.com','1688ce1f':'stowe.com',
  'c7ba4496':'skicb.com','717fe0e8':'northstarcalifornia.com','f6908eab':'okemo.com','0df6f263':'skiwildcat.com',
  '53a4f73e':'stevenspass.com','513237f9':'attitash.com','718db266':'kirkwood.com','74dd4473':'mountsnow.com',
  '0220b917':'huntermtn.com','8107ea0d':'mountsunapee.com','97655053':'skiwhitetail.com','414efa2c':'crotchedmtn.com',
  'c4e2d22a':'laurelmountainski.com','58ebc983':'7springs.com','67139981':'skiroundtop.com',
  '6fab99ca':'libertymountainresort.com','04a5001a':'hiddenvalleyresort.com','37f4ea45':'aftonalps.com',
  '05913b1b':'hiddenvalleyski.com','305c84e4':'skimadriver.com','a3712cf8':'paolipeaks.com','88471079':'skisnowcreek.com',
  '209437aa':'alpinevalleyohio.com','5a1a80c1':'wilmotmountain.com','eb223379':'mtbrighton.com',
}
for (const [id,domain] of Object.entries(vail)) {
  const page = ['skicb.com','stevenspass.com','mountsnow.com'].includes(domain) ? 'weather-report' : 'snow-and-weather-report'
  const url=`https://www.${domain}/the-mountain/mountain-conditions/${page}.aspx`
  job([id], 'Resort snow report · Vail Resorts',url,async()=>vailSnow(await get(url)))
}
for (const [id,domain,name,location] of [
  ['ecea3ea3','skifernie.com',/Fernie Alpine Resort/i,'Bear Weather Plot · 1,615 m'],
  ['64e116da','kickinghorseresort.com',/Kicking Horse/i,'Resort report'],['629f4173','skinakiska.com',/Nakiska/i,'Resort report'],
  ['14471d68','skikimberley.com',/Kimberley/i,'Resort report'],
] as const) {
  job([id],'Resort snow report · Resorts of the Canadian Rockies',`https://${domain}/conditions/snow-report/`,
    async()=>rcrSnow(JSON.parse(await get(`https://${domain}/wp-content/themes/kallyas-child/reportData/snowReport.json`)),name,location))
}
for (const [id, slug] of Object.entries({ a49c1598:'jiigatake', '351e73f4':'kashimayari', ece5006c:'sanosaka', c841118d:'goryu', '6d8c8a9a':'hakuba47', '2badaaea':'happo', '18cba912':'iwatake', '0cbcc6a3':'tsugaike', '9e9a84ef':'norikura', b602362c:'cortina' })) {
  const url=`https://www.hakubavalley.com/en/weather_en/detail_${slug}_en/`
  job([id],'Resort snow report · Hakuba Valley',url,async()=>hakubaSnow(await get(url)))
}
const seli='https://penteli.meteo.gr/stations/seli/seli.htm'
job(['10910feb'],'National Observatory of Athens · Seli ski center',seli,async()=>seliRain(await get(seli,'windows-1253')),'station')

for (const [id,slug,name,elevation] of [
  ['a06f4e81','parnassos1950','Parnassos, Kelaria',1950],
  ['e8a6ca6d','vasilitsa','Vasilitsa',1780],
  ['17084b85','kaimaktsalan','Kaimaktsalan Ski Center',2090],
] as const) {
  const url = `https://penteli.meteo.gr/stations/${slug}/`
  job([id], `National Observatory of Athens · ${name}`, url, async()=>observatoryRain(await get(url),name,elevation), 'station')
}

// LTS supplies measuring points, not operator-wide totals. Use only open CC0 observations
// near the mountain, label the distance, and keep the last snowfall date apart from report time.
const lts='https://tourism.api.opendatahub.com/v1/Weather/Measuringpoint'
const ltsSource='LTS · South Tyrol Open Data Hub'
const italian=resorts.filter(r=>r.cc==='IT')
jobs.push(async()=>{
  try {
    const data=JSON.parse(await get(lts+'?pagesize=150&fields=Id,Active,Shortname,GpsInfo,SnowHeight,newSnowHeight,LastSnowDate,LastUpdate,LicenseInfo'))
    if (!Array.isArray(data.Items) || !data.Items.length || data.TotalPages!==1) throw Error('Incomplete station directory')
    for (const point of data.Items) {
      const reading=ltsReading(point), pos=point.GpsInfo?.[0]; if (!reading || !pos || !/^[0-9A-F]{32}$/.test(point.Id)) continue
      const km=(r: Resort)=>Math.hypot((pos.Latitude-r.la)*111.2,(pos.Longitude-r.lo)*111.2*Math.cos(r.la*Math.PI/180))
      const r=italian.reduce((best,r)=>km(r)<km(best)?r:best,italian[0]), dist=km(r)
      if (!(dist<=3) || !Number.isFinite(pos.Altitude) || pos.Altitude<r.b-150 || pos.Altitude>r.t+150) continue
      reading.place+=` · ${dist.toFixed(1)} km from mapped center`
      add([r.id],{kind:'station',source:ltsSource,url:`${lts}/${point.Id}`,checked:now,readings:[reading]})
    }
    successful++
  } catch(e) {failures++;console.warn(`${ltsSource}: ${(e as Error).message}`);keep(italian.map(r=>r.id),ltsSource)}
})
let next=0
await Promise.all(Array.from({length:4},async()=>{while(next<jobs.length) await jobs[next++]()}))
const entries=Object.entries(snapshot.resorts).sort(([a],[b])=>a.localeCompare(b))
if (!successful && !entries.length) throw Error('No successful requests or recent fallback; keeping existing snapshot')
snapshot.resorts=Object.fromEntries(entries)
await writeFile(out+'.tmp',JSON.stringify(snapshot)+'\n'); await rename(out+'.tmp',out)
console.log(`${entries.length}/${resorts.length} mountain entries: ${entries.filter(([,rs])=>rs.some(r=>r.kind==='operator')).length} with operator totals; ${entries.filter(([,rs])=>rs.some(r=>r.readings.some(o=>o.values.rainToday))).length} with a rain gauge. Requests: ${successful} succeeded, ${failures} failed.`)
