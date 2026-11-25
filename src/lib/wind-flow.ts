import type { LonLat } from './trails.ts'

type Box = readonly [number, number, number, number]
export type FlowSeed = { key: string; at: LonLat; phase: number }

/** A visual cadence, not a distance-to-time scale. Speed is always in km/h. */
export const flowPeriod = (kmh: number) => 84 / (12 + Math.min(kmh, 140) * 0.8)

/** An earth-fixed staggered grid. Zooming in fills the visible trails rather than
 * spreading a fixed handful of arrows miles apart. Limit work on wide/tilted maps. */
export function flowSeeds(resort: Box, view: Box, zoom: number): FlowSeed[] {
  const [w,s,e,n] = resort
  const west = Math.max(w, view[0]), south = Math.max(s, view[1])
  const east = Math.min(e, view[2]), north = Math.min(n, view[3])
  if (west > east || south > north) return []
  const cx = (w+e)/2, cy = (s+n)/2
  const level = Math.round(zoom*2)/2
  let dx = 60 * 360 / (512 * 2**level)
  let dy = dx * Math.cos(cy * Math.PI/180)
  let step = 1
  while ((Math.ceil((east-west)/dx)+1) * (Math.ceil((north-south)/dy)+1) > 80) {
    dx *= 2; dy *= 2; step *= 2
  }
  const seeds: FlowSeed[] = []
  for (let j=Math.ceil((south-cy)/dy); j<=Math.floor((north-cy)/dy); j++) {
    const origin = cx + (Math.abs(j)%2)*dx/2
    for (let i=Math.ceil((west-origin)/dx); i<=Math.floor((east-origin)/dx); i++) {
      // Stable, asynchronous starting positions; changing phase never changes the forecast.
      const phase = ((i*0.618034 + j*0.414214 + 0.5)%1+1)%1
      seeds.push({ key:`${level}/${step}/${i}/${j}`, at:[origin+i*dx,cy+j*dy], phase })
    }
  }
  return seeds
}
