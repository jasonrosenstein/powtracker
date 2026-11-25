import { useEffect } from 'react'
import { Marker, Popup, type Map as MlMap } from 'maplibre-gl'
import { useAsync, type Async } from '../lib/hooks.ts'
import { compass, type MountainHour, type MountainWeather } from '../lib/mountain-weather.ts'
import { blowingTo } from '../lib/trail-wind.ts'
import { flowPeriod, flowSeeds } from '../lib/wind-flow.ts'
import type { Resort } from '../lib/types.ts'
import { fmtElev, fmtWind, type Units } from '../lib/units.ts'
import { fetchWindStations, isRecentWind, type WindStation } from '../lib/wind-stations.ts'

type Bounds = [number,number,number,number]
export const directionOf = (hour?:MountainHour) => hour?.wind != null && hour.wind>0 ? hour.fromDegrees : null
export function windSummary(hour:MountainHour,units:Units) {
  const from=directionOf(hour)
  return `${hour.wind==null?'Speed unavailable':hour.wind===0?'Calm':fmtWind(hour.wind,units)}${from!=null?` from ${compass(from)} (${Math.round(from)}°)` : hour.wind ? ' · direction unavailable' : ''} · ${hour.gust==null?'gusts unavailable':`gusts ${fmtWind(hour.gust,units)}`}`
}
export const localForecastTime=(ms:number,offset:number)=>new Date(ms+offset*1000).toLocaleString(undefined,{timeZone:'UTC',weekday:'short',hour:'numeric',minute:'2-digit'})
const measuredTime=(ms:number)=>new Date(ms).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'})
function measuredText(s:WindStation,u:Units) {
  return `${fmtWind(s.speed,u)}${s.from!=null&&s.speed>0?` from ${compass(s.from)}`:''}${s.gust!=null?` · gusts ${fmtWind(s.gust,u)}`:''}${s.elevation!=null?` · ${fmtElev(s.elevation,u)}`:''}`
}

export default function TrailWind({map,resort,bounds,weather,hour,index,setIndex,count,units,dark}:{
  map:MlMap|null;resort:Resort;bounds:Bounds;weather:Async<MountainWeather>;hour?:MountainHour;index:number;setIndex:(i:number)=>void;count:number;units:Units;dark:boolean
}) {
  const from=directionOf(hour), speed=hour?.wind
  const stations=useAsync(signal=>fetchWindStations(resort,bounds,signal),[resort.id,bounds])
  // Use the wind FROM bearing as the hillshade light: faces towards it get the windward tint.
  // Arrowheads point 180° away. Geographic anchors remain correct as the map is rotated.
  useEffect(()=>{
    if (!map?.getLayer('wind-aspect') || from==null) return
    map.setPaintProperty('wind-aspect','hillshade-illumination-direction',Math.round(from)%360)
    map.setLayoutProperty('hillshade','visibility','none')
    map.setLayoutProperty('wind-aspect','visibility','visible')
    return ()=>{
      if(map.getLayer('wind-aspect')) {map.setLayoutProperty('wind-aspect','visibility','none');map.setLayoutProperty('hillshade','visibility','visible')}
    }
  },[map,from])

  // MapLibre owns the outer marker's geographic transform. CSS moves only its child:
  // no React updates, map repaints, or weather requests for animation frames.
  useEffect(()=>{
    if (!map || from == null || speed == null || speed <= 0) return
    const container = map.getContainer(), markers = new Map<string,Marker>()
    const period = flowPeriod(speed), to = blowingTo(from)
    const sync = () => {
      const v = map.getBounds()
      const seeds = flowSeeds(bounds,[v.getWest(),v.getSouth(),v.getEast(),v.getNorth()],map.getZoom())
      const keep = new Set(seeds.map(seed=>seed.key))
      for (const [key,marker] of markers) if (!keep.has(key)) { marker.remove(); markers.delete(key) }
      for (const {key,at,phase} of seeds) {
        if (markers.has(key)) continue
        const anchor = document.createElement('div'), streak = document.createElement('i')
        anchor.className='trail-flow'; anchor.setAttribute('aria-hidden','true')
        streak.style.animationDuration=`${period}s`; streak.style.animationDelay=`${-phase*period}s`
        anchor.appendChild(streak)
        markers.set(key,new Marker({element:anchor,rotation:to,rotationAlignment:'map',pitchAlignment:'map'}).setLngLat(at).addTo(map))
      }
    }
    let inView = false
    const visibility = () => container.classList.toggle('flow-paused',!inView || document.hidden)
    const observer = new IntersectionObserver(([entry])=>{ inView=entry.isIntersecting; visibility() })
    visibility(); observer.observe(container); document.addEventListener('visibilitychange',visibility)
    sync(); map.on('moveend',sync); map.on('resize',sync)
    return ()=>{
      observer.disconnect(); document.removeEventListener('visibilitychange',visibility); container.classList.remove('flow-paused')
      map.off('moveend',sync); map.off('resize',sync); markers.forEach(marker=>marker.remove())
    }
  },[map,bounds,from,speed])
  const present=index===0 && (!hour || Math.abs(Date.now()-hour.time)<3600_000)
  useEffect(()=>{
    if(!map || !present || stations.status!=='ready') return
    const markers=stations.data.filter(s=>isRecentWind(s.time)).map(s=>{
      const button=document.createElement('button');button.type='button';button.className='wind-station';button.textContent='●';button.setAttribute('aria-label',`Measured wind at ${s.name}: ${measuredText(s,units)}`)
      const marker=new Marker({element:button}).setLngLat(s.point).setPopup(new Popup({offset:12}).setText(`${s.name} · measured ${measuredText(s,units)} · ${measuredTime(s.time)} · ${s.source}`)).addTo(map)
      return marker
    });return ()=>markers.forEach(m=>m.remove())
  },[map,present,stations,units])
  const stamp=hour&&weather.status==='ready'?localForecastTime(hour.time,weather.data.offsetSec):''
  const nearby=stations.status==='ready'?stations.data.filter(s=>isRecentWind(s.time)):[]
  return <section className="trail-wind-panel" aria-label="Trail wind forecast">
    <b>Mountain wind forecast</b> {stamp && <span>· {stamp} mountain time</span>}
    {hour ? <>
      <p className="num"><strong>{windSummary(hour,units)}</strong>{from!=null?` · air moves ${compass(blowingTo(from))}`:''}</p>
      {count>1 && <label>Forecast hour <input aria-label="Trail wind forecast hour" aria-valuetext={stamp} type="range" min={0} max={count-1} value={index} onChange={e=>setIndex(Number(e.target.value))} /></label>}
      {from!=null && <p><span className="wind-key" style={{background:dark?'#ffb45b':'#b96214'}}/> Wind-facing &nbsp; <span className="wind-key" style={{background:dark?'#78cbdb':'#347f9d'}}/> Lee-facing</p>}
      <p className="hint">Open-Meteo · streaks move downwind, faster in stronger forecast wind. All use the same mountain forecast. Tint shows slope orientation, not local speed or guaranteed shelter.</p>
    </> : <p>{weather.status==='loading'?'Loading mountain wind…':'Mountain wind forecast unavailable. No forecast flow shown.'}</p>}
    {present && <details><summary>{nearby.length?`Measured wind · ${nearby.length} nearby station${nearby.length===1?'':'s'}`:'Station wind readings'}</summary>
      {nearby.length ? <ul>{nearby.map(s=><li key={s.id}><b>{s.name}</b> · {measuredText(s,units)} · {measuredTime(s.time)} · {s.source}</li>)}</ul>:<p>{stations.status==='loading'?'Checking nearby stations…':stations.status==='error'?'Station service unavailable.':'No recent station wind readings available here.'}</p>}
    </details>}
  </section>
}
