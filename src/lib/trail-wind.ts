// Wind bearings are geographic, clockwise from true north. The forecast is one model
// sample for the mountain; terrain comparisons do not manufacture local wind speeds.
import type { LonLat } from './trails.ts'
const rad = Math.PI / 180
const wrap = (b: number) => (b % 360 + 360) % 360
export const blowingTo = (from: number) => wrap(from + 180)
const dxScale = (lat: number) => 111_195 * Math.cos(lat * rad)
export const offset = ([lng, lat]: LonLat, bearing: number, metres: number): LonLat => [
  lng + Math.sin(bearing * rad) * metres / dxScale(lat), lat + Math.cos(bearing * rad) * metres / 111_195,
]

/** Take a short chord around the tap, along the real polyline. Never assume lines are stored uphill. */
export function routeChord(line: readonly LonLat[], at: LonLat): [LonLat, LonLat] | null {
  let best = Infinity, along = 0
  const cumulative = [0], x = dxScale(at[1]), y = 111_195
  for (let i = 1; i < line.length; i++) {
    const a = line[i-1], b = line[i], dx = (b[0]-a[0])*x, dy = (b[1]-a[1])*y, len = Math.hypot(dx,dy)
    cumulative.push(cumulative[i-1]+len)
    if (len === 0) continue
    const px = (at[0]-a[0])*x, py = (at[1]-a[1])*y
    const t = Math.max(0,Math.min(1,(px*dx+py*dy)/(len*len)))
    const d = (px-t*dx)**2+(py-t*dy)**2
    if (d < best) {best=d; along=cumulative[i-1]+t*len}
  }
  const total = cumulative.at(-1)!
  if (total < 25) return null
  const point = (m: number): LonLat => {
    const i = cumulative.findIndex((v,j) => j>0 && v>=m && v>cumulative[j-1])
    const a=line[i-1], b=line[i], t=(m-cumulative[i-1])/(cumulative[i]-cumulative[i-1])
    return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t]
  }
  return [point(Math.max(0,along-75)), point(Math.min(total,along+75))]
}

export function relativeWind(chord: [LonLat,LonLat], z0: number, z1: number, uphill: boolean, from: number): string | null {
  // DEM noise or a nearly flat section cannot establish a direction of travel.
  if (Math.abs(z1-z0)<5) return null
  const [a,b] = chord
  const dx=(b[0]-a[0])*dxScale((a[1]+b[1])/2), dy=(b[1]-a[1])*111_195
  if (Math.hypot(dx,dy)<20) return null
  const forward = (z1>z0)===uphill
  const heading = Math.atan2(dx,dy)/rad + (forward?0:180)
  const angle = Math.abs(wrap(from-heading+180)-180)
  return `${angle < 60 ? 'Headwind' : angle > 120 ? 'Tailwind' : 'Crosswind'} ${uphill ? 'riding up' : 'skiing down'} this section`
}

/** Qualitative exposure from the DEM, 120 m on either side along the forecast flow. */
export function exposure(upwind: number, here: number, downwind: number): string {
  if (here-upwind>6 && here-downwind>6) return 'Near a crest · gusts and direction can vary'
  if (upwind-here>6 && downwind-here>6) return 'In a hollow · local flow uncertain'
  if (downwind-upwind>12) return 'Wind-facing slope · potentially more exposed'
  if (upwind-downwind>12) return 'Lee-facing slope · shelter is not guaranteed'
  return 'Little elevation change along the wind · exposure uncertain'
}

// Read Mapzen Terrarium at zoom 12 (~15–30 m cells on most ski mountains). Only requested
// when someone taps with Wind on. Do not treat a failed tile or transparent pixel as sea level.
const cache = new Map<string, Promise<Uint8ClampedArray>>()
async function pixels(x: number, y: number) {
  const key = `12/${x}/${y}`
  let entry = cache.get(key)
  if (!entry) {
    entry = (async()=>{
      const res=await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${key}.png`,{signal:AbortSignal.timeout(8000)})
      if (!res.ok) throw Error('Terrain tile unavailable')
      const image=await createImageBitmap(await res.blob())
      try {
        if(image.width!==256 || image.height!==256) throw Error('Unexpected terrain resolution')
        const canvas=document.createElement('canvas'); canvas.width=canvas.height=256
        const ctx=canvas.getContext('2d')!; ctx.drawImage(image,0,0)
        return ctx.getImageData(0,0,256,256).data
      } finally {image.close()}
    })().catch(e=>{cache.delete(key);throw e})
    if (cache.size>=24) cache.delete(cache.keys().next().value!)
    cache.set(key,entry)
  }
  return entry
}
async function elevation([lng,lat]: LonLat): Promise<number> {
  const n=4096, x=((lng+180)/360*n+n)%n, y=(1-Math.asinh(Math.tan(lat*rad))/Math.PI)/2*n
  const p=await pixels(Math.floor(x),Math.floor(y)), i=((Math.floor(y*256)%256)*256+Math.floor(x*256)%256)*4
  if(p[i+3]!==255) throw Error('No terrain cell')
  return p[i]*256+p[i+1]+p[i+2]/256-32768
}
export async function terrainWind(at: LonLat, line: LonLat[] | null, uphill: boolean, from: number): Promise<string[]> {
  const chord=line ? routeChord(line,at) : null
  // Establish a lift's direction from its terminals, not the ground under the cable:
  // a chair can climb while crossing a ravine where the local ground drops away.
  const endsToSample = uphill && line && chord ? [line[0],line[line.length-1]] : chord ?? []
  const [u,c,d,...ends]=await Promise.all([offset(at,from,120),at,offset(at,blowingTo(from),120),...endsToSample].map(elevation))
  const travel=chord ? relativeWind(chord,ends[0],ends[1],uphill,from) : null
  return [exposure(u,c,d), ...(travel?[travel]:[])]
}
