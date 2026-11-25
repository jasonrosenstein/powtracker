// Recent measured wind, deliberately separate from the model. Never move a reading onto
// a lift: pins use the reporting station's own coordinates. Only queried with Wind enabled.
import type { Resort } from './types.ts'
import type { LonLat } from './trails.ts'
export interface WindStation { id:string; name:string; point:LonLat; elevation:number|null; time:number; speed:number; gust:number|null; from:number|null; source:string }
const valid=(n:unknown):n is number=>typeof n==='number' && Number.isFinite(n)
const dir=(n:unknown)=>valid(n)&&n>=0&&n<=360?n%360:null
export const isRecentWind=(time:number,now=Date.now())=>Number.isFinite(time)&&time<=now+5*60_000&&time>=now-2*3600_000
interface Quantity {value?:number|null;unitCode?:string;qualityControl?:string}
export function speedKmh(q:Quantity|undefined) {
  if (!q || !valid(q.value) || q.value<0 || ['X','Q','B'].includes(q.qualityControl??'')) return null
  const factor:Record<string,number>={'wmoUnit:km_h-1':1,'wmoUnit:m_s-1':3.6,'wmoUnit:kn':1.852}
  const scale=factor[q.unitCode??'']; return scale==null?null:q.value*scale
}
interface Site {id:string; name:string; point:LonLat; elevation:number|null}
function closest(sites:Site[],r:Pick<Resort,'la'|'lo'>,box:readonly number[]) {
  const km=(s:Site)=>Math.hypot((s.point[0]-r.lo)*111*Math.cos(r.la*Math.PI/180),(s.point[1]-r.la)*111)
  return sites.filter(({point:[x,y]})=>valid(x)&&valid(y)&&x>=box[0]-.015&&x<=box[2]+.015&&y>=box[1]-.01&&y<=box[3]+.01).sort((a,b)=>km(a)-km(b)).slice(0,4)
}
async function json<T>(url:string,signal:AbortSignal,missing=false):Promise<T|null> {
  const res=await fetch(url,{signal}); if(missing&&res.status===404) return null
  if(!res.ok) throw Error(`Station service: HTTP ${res.status}`)
  return await res.json() as T
}
type NWSFeature={geometry:{coordinates:LonLat};properties:{stationIdentifier:string;name:string;elevation:Quantity}}
type NWSReading={properties:{timestamp:string;windGust:Quantity;windSpeed:Quantity;windDirection:Quantity}}
export async function fetchWindStations(r:Pick<Resort,'cc'|'la'|'lo'>,box:readonly number[],signal:AbortSignal):Promise<WindStation[]> {
  if(r.cc==='US') {
    const api='https://api.weather.gov'
    const p=await json<{properties:{observationStations:string}}>(`${api}/points/${r.la.toFixed(4)},${r.lo.toFixed(4)}`,signal)
    const url=new URL(p!.properties.observationStations)
    if(url.origin!==api || !url.pathname.startsWith('/gridpoints/')) throw Error('Unknown station directory')
    const data=await json<{features:NWSFeature[]}>(url.href,signal)
    const sites=closest(data!.features.map(f=>({id:f.properties.stationIdentifier,name:f.properties.name,point:f.geometry.coordinates,elevation:f.properties.elevation?.value??null})),r,box)
    const settled=await Promise.allSettled(sites.map(async s=>{
      const obs=(await json<NWSReading>(`${api}/stations/${encodeURIComponent(s.id)}/observations/latest`,signal,true))?.properties
      if(!obs) return null
      const speed=speedKmh(obs.windSpeed),time=Date.parse(obs.timestamp)
      return speed!=null && isRecentWind(time) ? {...s,time,speed,gust:speedKmh(obs.windGust),from:dir(obs.windDirection?.value),source:'NOAA / NWS'} : null
    }))
    if(settled.length && settled.every(x=>x.status==='rejected')) throw Error('Station readings unavailable')
    return settled.flatMap(x=>x.status==='fulfilled'&&x.value?[x.value]:[])
  }
  if(r.cc==='AT') {
    const api='https://dataset.api.hub.geosphere.at/v1/station/current/tawes-v1-10min'
    type ATStation={id:string;name:string;lon:number;lat:number;altitude:number;is_active:boolean}
    const meta=await json<{stations:ATStation[]}>(`${api}/metadata`,signal)
    const sites=closest(meta!.stations.filter(s=>s.is_active).map(s=>({id:s.id,name:s.name,point:[s.lon,s.lat],elevation:s.altitude})),r,box)
    if(!sites.length) return []
    type Param={unit:string;data:(number|null)[]}
    const data=await json<{timestamps:string[];features:{properties:{station:string;parameters:Record<string,Param>}}[]}>(`${api}?parameters=FF,FFX,DD&station_ids=${sites.map(s=>s.id).join(',')}`,signal)
    const i=data!.timestamps.length-1,time=Date.parse(data!.timestamps[i]); if(!isRecentWind(time)) return []
    return data!.features.flatMap(f=>{
      const site=sites.find(s=>s.id===f.properties.station), p=f.properties.parameters
      const speed=speedKmh({value:p.FF?.data[i],unitCode:p.FF?.unit==='m/s'?'wmoUnit:m_s-1':''})
      const gust=speedKmh({value:p.FFX?.data[i],unitCode:p.FFX?.unit==='m/s'?'wmoUnit:m_s-1':''})
      return site&&speed!=null?[{...site,time,speed,gust,from:p.DD?.unit==='°'?dir(p.DD.data[i]):null,source:'GeoSphere Austria'}]:[]
    })
  }
  return []
}
