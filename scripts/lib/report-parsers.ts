import type { Amount, Reading, ReportMetric } from '../../src/lib/reports.ts'

type Fields = Record<string, unknown>
const obj = (x: unknown): Fields => x && typeof x === 'object' && !Array.isArray(x) ? x as Fields : {}
const str = (x: unknown) => typeof x === 'string' && x.trim() !== '--' ? x.trim() : ''
export const number = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : typeof x === 'string' && /^\d+(?:\.\d+)?$/.test(x.trim()) ? Number(x) : undefined
function put(row: Reading, key: ReportMetric, metric: unknown, imperial?: unknown) {
  const cm = number(metric), inches = number(imperial)
  if (cm === undefined && inches === undefined) return
  // mtnpowder sometimes converts an explicitly missing imperial reading to metric zero.
  if (cm === 0 && inches === undefined && typeof imperial === 'string' && !str(imperial)) return
  const value: Amount = {}
  if (cm !== undefined) value.metric = cm
  if (inches !== undefined) value.inches = inches
  row.values[key] = value
}
const iso = (s: string) => { const ms = Date.parse(s); return Number.isFinite(ms) ? new Date(ms).toISOString() : null }
const hasValues = (r: Reading) => Object.keys(r.values).length > 0
const row = (place: string, at: string | null): Reading => ({ place, at, values: {} })
export type Parsed = { readings: Reading[]; surface?: string }

export function alterraSnow(body: unknown): Parsed {
  const r = obj(obj(body).SnowReport), at = iso(str(r.LastUpdate)) // NOT the lift feed’s LastUpdate
  const rows = [['MidMountainArea','Mid-mountain'], ['BaseArea','Base'], ['SummitArea','Summit']].map(([k, fallback]) => {
    const a = obj(r[k]), result = row(str(a.Name) || fallback, at)
    for (const [key, name] of Object.entries({ day:'Last24Hours', closed:'SinceLiftsClosed', twoDays:'Last48Hours', threeDays:'Last72Hours', week:'Last7Days', depth:'Base' }))
      put(result, key as ReportMetric, a[name+'Cm'], a[name+'In'])
    return result
  })
  const overall = row('Resort-wide', at)
  put(overall, 'storm', r.StormTotalCM, r.StormTotalIn)
  put(overall, 'season', r.SeasonTotalCm, r.SeasonTotalIn)
  return { readings: [...rows, overall].filter(hasValues), surface: str(r.BaseConditions) || undefined }
}

// Read JSON assignments, never execute a script from a website. Require the display settings:
// zeroes from a hidden/off-season component are not a published snow report.
export function vailSnow(html: string, place = 'Resort report'): Parsed {
  const data = (field: string) => { const match = html.match(new RegExp('\\bFR\\.' + field + '\\s*=\\s*(\\{[^\\n\\r]*?\\})\\s*;')); return match ? obj(JSON.parse(match[1])) : {} }
  const settings = data('snowReportSettings'), report = data('snowReportData')
  if (!Object.keys(settings).length || !Object.keys(report).length) throw Error('Snow report format not found')
  if (settings.HideSnowReport !== false) return { readings: [] }
  const stamp = str(report.LastUpdatedText).replace(/^Updated\s+/i,'').replace(/ at /i,' ')
  const result = row(settings.UseSummitSnowReadings === true ? 'Summit' : place, /\b(?:[PMCE][DS]T|AK[DS]T|UTC|GMT)$/.test(stamp) ? iso(stamp) : null)
  const halfDay = /overnight/i.test(str(settings.TwelveHrSnowfallLabel)) ? 'overnight' : 'halfDay'
  const fields: [string, string, ReportMetric][] = [['Show24Hr','TwentyFourHourSnowfall','day'], ['Show12Hr','OvernightSnowfall',halfDay], ['Show48Hr','FortyEightHourSnowfall','twoDays'], ['Show7Day','SevenDaySnowfall','week'], ['BaseDepth','BaseDepth','depth'], ['ShowTotalSeasonSnowfall','CurrentSeason','season']]
  for (const [toggle, field, key] of fields) if (settings[toggle] === true) { const a = obj(report[field]); put(result,key,a.Centimeters,a.Inches) }
  return { readings: [result].filter(hasValues), surface: str(report.OverallSnowConditions) || undefined }
}

export function rcrSnow(body: unknown, expectedName: RegExp, place: string): Parsed {
  const r = obj(body)
  if (!expectedName.test(decodeURIComponent(str(r.resortName)))) throw Error('Different resort in snow report')
  const stamp = decodeURIComponent(str(r.saveDate)), result = row(place, /GMT[+-]\d{4}/.test(stamp) ? iso(stamp) : null)
  for (const [key, field] of Object.entries({day:'newSnow24', overnight:'newSnowOvernight', twoDays:'newSnow48', week:'newSnow7days', depth:'snowPack', season:'newSnowYTD'})) put(result,key as ReportMetric,r[field])
  return { readings: [result].filter(hasValues) }
}

// Both these sources publish a local clock without an offset. Validate the clock by round-trip
// in the station’s zone; never let a CI runner or phone silently treat it as its own local time.
export function zoned(local: string, zone: string) {
  if (!/^20\d\d-\d\d-\d\dT\d\d:\d\d$/.test(local)) return null
  const f = new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})
  for (const offset of [1,2,3]) { const ms = Date.parse(local+'Z') - offset * 3600e3; if (Number.isFinite(ms) && f.format(ms).replace(' ','T') === local) return new Date(ms).toISOString() }
  return null
}

export function seliRain(html: string): Parsed {
  const strip = (s: string) => s.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ').trim()
  const txt = strip(html), stamp = txt.match(/\bSeli,\s*(\d{1,2}):(\d\d),\s*(\d{1,2})\/(\d{1,2})\/(\d\d)\b/i)
  if (!stamp || !/Seli National Ski Center/i.test(txt)) throw Error('Station or report timestamp not found')
  const [,h,m,d,mo,y] = stamp, at = zoned(`20${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}T${h.padStart(2,'0')}:${m}`, 'Europe/Athens')
  const result = row('Seli ski-center gauge · 1,510 m', at)
  result.zone = 'Europe/Athens'
  for (const tr of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(c=>strip(c[1]))
    for (let i=1;i<cells.length;i++) if (/^Today's Rain\b/i.test(cells[i-1])) put(result,'rainToday',cells[i].match(/^(\d+(?:\.\d+)?)\s*mm$/i)?.[1])
  }
  return { readings:[result].filter(hasValues) }
}

// This timestamp belongs to the weather/snow table. The later lift table has its own clock.
export function hakubaSnow(html: string): Parsed {
  const section = html.match(/WEATHER&(?:amp;)?SNOW REPORT<\/h3>([\s\S]*?)<\/table>/i)?.[1]
  if (!section) throw Error('Snow report table not found')
  const stamp = section.match(/(20\d\d)\/(\d\d)\/(\d\d) (\d\d:\d\d)\s+Update/i)
  const at = stamp ? iso(`${stamp[1]}-${stamp[2]}-${stamp[3]}T${stamp[4]}:00+09:00`) : null
  const rows = [...section.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(tr=>[...tr[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell=>cell[1].replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').trim()))
  // Resolve by header, not position: a new column must not turn temperature into snowfall.
  const header = (rows.shift()??[]).map(s=>s.toLowerCase().replace(/[’']/g,"'").replace(/\s+/g,''))
  if (!header.includes('snowdepth(cm)') || !header.includes("today'ssnowfall(cm)")) throw Error('Unknown snow columns or units')
  return {readings: rows.map(cells=>{
    const get=(key:string)=>cells[header.indexOf(key)], r=row(str(get('area/item'))||'Resort report',at)
    put(r,'today',get("today'ssnowfall(cm)")); put(r,'depth',get('snowdepth(cm)')); put(r,'total',get('totalsnowfall(cm)'))
    r.zone='Asia/Tokyo'; r.sky=str(get('weather'))||undefined; r.surface=str(get('snowcondition'))||undefined
    return r
  }).filter(hasValues)}
}

export function ltsReading(input: unknown): Reading | null {
  const p = obj(input), license = obj(p.LicenseInfo)
  if (license.ClosedData !== false || license.License !== 'CC0' || p.Active !== true || !str(p.Shortname)) return null
  const result = row(str(p.Shortname), zoned(str(p.LastUpdate).slice(0,16),'Europe/Rome'))
  result.zone = 'Europe/Rome'
  put(result,'depth',p.SnowHeight); put(result,'recent',p.newSnowHeight)
  if (result.values.recent && /^20\d\d-\d\d-\d\d/.test(str(p.LastSnowDate))) result.snowDate = str(p.LastSnowDate).slice(0,10)
  return hasValues(result) ? result : null
}
