// Météo-France's open mountain-observation archive: ht_neige = total depth in metres,
// validity_time = UTC observation time. rr24 includes snow, and ssfrai does not imply 24 h.
interface FrenchStation {
  source: string; name: string; lat: number; lon: number; elevation: number
  depthCm: {value: number; at: string}
}
export function franceNivo(csv: string, now: number, maxAgeHours: number): FrenchStation[] {
  const [header, ...rows] = csv.trim().split(/\r?\n/)
  const cols = header.replace(/^﻿/, '').split(';')
  const keys = ['geo_id_wigos','name','lat','lon','Altitude','validity_time','ht_neige']
  const indices = keys.map(k => cols.indexOf(k))
  if (indices.includes(-1)) throw Error('Unknown Météo-France NIVO schema')
  const stations = new Map<string, FrenchStation>()
  for (const line of rows) {
    const values = line.split(';')
    if (values.length !== cols.length) continue
    const [id, name, lat, lon, elev, at, depth] = indices.map(i => values[i].trim())
    if (!id || !name || ![lat,lon,elev,depth].every(v => /^-?\d+(?:\.\d+)?$/.test(v))) continue
    const ms = Date.parse(at)
    if (!at.endsWith('Z') || !Number.isFinite(ms) || ms > now || now - ms > maxAgeHours * 3_600_000) continue
    if (+depth < 0 || +depth > 8 || Math.abs(+lat) > 90 || Math.abs(+lon) > 180 || +elev < 0 || +elev > 5000) continue
    const previous = stations.get(id)
    if (previous && Date.parse(previous.depthCm.at) > ms) continue
    stations.set(id, {source:'Météo-France · réseau nivo-météorologique', name:name.replace(/_NIVO$/i,''), lat:+lat, lon:+lon,
      elevation:+elev, depthCm:{value:100 * +depth, at:new Date(ms).toISOString()}})
  }
  return [...stations.values()]
}
