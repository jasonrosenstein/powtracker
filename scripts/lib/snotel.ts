// USDA NRCS AWDB REST: use measured hourly SNWD (inches), not SWE or accumulated precip.
export interface SnotelSite { stationTriplet: string; networkCode: string; name: string; latitude: number; longitude: number; elevation: number; dataTimeZone: number }
export interface SnotelRecord {
  stationTriplet: string
  data: { stationElement: {elementCode: string; durationName: string; ordinal: number; storedUnitCode: string}; values?: {date: string; value: number | null; qcFlag?: string}[] }[]
}
export const feetToMetres = (feet: number) => feet * 0.3048
export function snotelReading(site: SnotelSite, record: SnotelRecord, now: number) {
  if (site.stationTriplet !== record.stationTriplet || site.networkCode !== 'SNTL' || !site.name ||
      ![site.elevation,site.latitude,site.longitude,site.dataTimeZone].every(Number.isFinite) || Math.abs(site.dataTimeZone)>14) return null
  const column = record.data?.find(({stationElement: e}) => e.elementCode === 'SNWD' && e.ordinal === 1 && e.durationName === 'HOURLY' && e.storedUnitCode === 'in')
  const samples = new Map<number,number>()
  for (const {date,value,qcFlag} of column?.values ?? []) {
    if (qcFlag !== 'V' || value == null || !Number.isFinite(value) || value < 0 || value * 2.54 > 800 || !/^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(date)) continue
    // AWDB station data use a numeric GMT offset (not the viewer's or a DST-adjusted clock).
    const at = Date.parse(date.replace(' ','T')+'Z') - site.dataTimeZone*3_600_000
    if (Number.isFinite(at) && at <= now) samples.set(at, value * 2.54)
  }
  const latest = Math.max(...samples.keys()), value = samples.get(latest)
  if (value == null || now-latest > 72*3_600_000) return null
  const at = new Date(latest).toISOString()
  const change = (hours: number) => { const prev = samples.get(latest - hours*3_600_000); return prev == null ? undefined : {at,value:Math.max(0,value-prev)} }
  return {source:'USDA NRCS SNOTEL',name:site.name,lat:site.latitude,lon:site.longitude,elevation:feetToMetres(site.elevation),
    depthCm:{at,value},change24Cm:change(24),change72Cm:change(72)}
}
