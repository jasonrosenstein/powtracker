// Avalanche danger for the backcountry around a mountain, from the public forecast services:
// avalanche.org for the United States and Avalanche Canada. Read in the browser when a mountain
// is opened. Inside a ski area's boundary the patrol manages the hazard; this is for terrain
// beyond the ropes.
import type { Resort } from './types.ts'

export interface AvalancheDanger {
  /** 1 low to 5 extreme; 0 when the centre has issued no rating. */
  level: 0 | 1 | 2 | 3 | 4 | 5
  /** "Moderate", or the centre's wording when there is no rating. */
  label: string
  zone: string
  center: string
  advice: string
  /** The full forecast on the centre's own site. */
  link: string
}

const LEVELS = ['No rating', 'Low', 'Moderate', 'Considerable', 'High', 'Extreme'] as const
const levelOf = (word: string): AvalancheDanger['level'] => {
  const i = LEVELS.findIndex((l) => l.toLowerCase() === word.toLowerCase())
  return (i > 0 ? i : 0) as AvalancheDanger['level']
}

type Ring = [number, number][]

/** Whether a point lies inside a polygon given as rings (outer first, then holes). */
export function inPolygon(lon: number, lat: number, rings: readonly Ring[]): boolean {
  let inside = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      // Each ring edge crossed by a ray going east flips inside/outside; holes flip it back.
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
    }
  }
  return inside
}

interface UsZone {
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown }
  properties: { name: string; center: string; danger: string; danger_level: number; travel_advice: string; link: string; off_season: boolean }
}
let usZones: Promise<UsZone[]> | null = null

async function unitedStates(r: Resort, signal?: AbortSignal): Promise<AvalancheDanger | null> {
  // One download serves every US mountain opened in this visit.
  usZones ??= fetch('https://api.avalanche.org/v2/public/products/map-layer', { signal })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`avalanche.org returned HTTP ${res.status}`))))
    .then((j: { features: UsZone[] }) => j.features)
    .catch((e) => {
      usZones = null
      throw e
    })
  const zone = (await usZones).find((z) => {
    const polys = z.geometry.type === 'Polygon' ? [z.geometry.coordinates as Ring[]] : (z.geometry.coordinates as Ring[][])
    return polys.some((rings) => inPolygon(r.lo, r.la, rings))
  })
  if (!zone) return null
  const p = zone.properties
  const level = (p.danger_level >= 1 && p.danger_level <= 5 ? p.danger_level : 0) as AvalancheDanger['level']
  return {
    level,
    label: level ? LEVELS[level] : p.off_season ? 'Off season: no forecast' : 'No rating issued',
    zone: p.name,
    center: p.center,
    advice: level ? p.travel_advice : '',
    link: p.link,
  }
}

async function canada(r: Resort, signal?: AbortSignal): Promise<AvalancheDanger | null> {
  const res = await fetch(`https://api.avalanche.ca/forecasts/en/products/point?lat=${r.la}&long=${r.lo}`, { signal })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Avalanche Canada returned HTTP ${res.status}`)
  const j = (await res.json()) as {
    url?: string
    owner?: { display?: string }
    report?: {
      title?: string
      highlights?: string
      dangerRatings?: { ratings?: Record<string, { rating?: { value?: string; display?: string } }> }[]
    }
  }
  // Today's rating is given for three elevation bands: take the highest.
  const bands = Object.values(j.report?.dangerRatings?.[0]?.ratings ?? {})
  const level = bands.reduce<AvalancheDanger['level']>((max, b) => {
    const l = levelOf((b.rating?.display ?? '').split(' - ').pop() ?? '')
    return l > max ? l : max
  }, 0)
  const highlights = (j.report?.highlights ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const title = j.report?.title ?? ''
  return {
    level,
    label: level ? LEVELS[level] : 'No rating issued',
    // Early-season bulletins cover dozens of areas at once: too long to be a zone name.
    zone: title.length > 60 ? 'Regional bulletin' : title,
    center: j.owner?.display ?? 'Avalanche Canada',
    advice: highlights,
    link: j.url ?? 'https://avalanche.ca',
  }
}

/** Whether a public avalanche forecast service covers this mountain's country. */
export const hasAvalancheService = (r: Pick<Resort, 'cc'>): boolean => r.cc === 'US' || r.cc === 'CA'

export async function fetchAvalancheDanger(r: Resort, signal?: AbortSignal): Promise<AvalancheDanger | null> {
  if (r.cc === 'US') return unitedStates(r, signal)
  if (r.cc === 'CA') return canada(r, signal)
  return null
}
