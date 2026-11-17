// Reads the OpenSkiMap ski-areas dataset (https://openskimap.org, ODbL) and normalises
// each named, operating downhill area into the fields the tracker needs.
import { readFileSync } from 'node:fs'

export const SKIAREAS_URL = 'https://tiles.openskimap.org/geojson/ski_areas.geojson'
export const SKIAREAS_FILE = 'data/raw/openskimap/ski_areas.geojson'

export interface SkiArea {
  /** Full OpenSkiMap id (40 hex chars). */
  osmId: string
  name: string
  /** ISO 3166-1 alpha-2, upper case. '' when OpenSkiMap has no place for the area. */
  cc: string
  country: string
  region: string
  locality: string
  lat: number
  lon: number
  /** Lowest and highest lift-served / run elevation, metres. */
  base: number
  top: number
  vert: number
  runKm: number
  lifts: number
  website: string
}

interface RawFeature {
  properties: {
    id: string
    name: string | null
    status: string | null
    activities?: string[]
    websites?: string[]
    places?: { iso3166_1Alpha2?: string; localized?: { en?: { country?: string; region?: string; locality?: string } } }[]
    statistics?: {
      minElevation?: number | null
      maxElevation?: number | null
      runs?: { byActivity?: Record<string, { byDifficulty?: Record<string, { lengthInKm?: number }> }> }
      lifts?: { byType?: Record<string, { count?: number }> }
    }
  }
  geometry: { type: 'Point' | 'Polygon' | 'MultiPolygon'; coordinates: unknown } | null
}

function centre(geometry: RawFeature['geometry']): [number, number] | null {
  if (!geometry) return null
  if (geometry.type === 'Point') return geometry.coordinates as [number, number]
  // Bounding-box centre of every vertex: good enough to land mid-mountain.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number') {
      const [x, y] = c as [number, number]
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    } else if (Array.isArray(c)) c.forEach(walk)
  }
  walk(geometry.coordinates)
  return Number.isFinite(minX) ? [(minX + maxX) / 2, (minY + maxY) / 2] : null
}

/** Every named, operating downhill ski area that has usable elevation data. */
export function loadSkiAreas(file = SKIAREAS_FILE): SkiArea[] {
  const fc = JSON.parse(readFileSync(file, 'utf8')) as { features: RawFeature[] }
  const out: SkiArea[] = []
  for (const f of fc.features) {
    const p = f.properties
    if (!p.name || p.status !== 'operating' || !(p.activities ?? []).includes('downhill')) continue
    const s = p.statistics
    if (!s || s.minElevation == null || s.maxElevation == null) continue
    const c = centre(f.geometry)
    if (!c) continue
    const place = p.places?.[0]
    const en = place?.localized?.en
    const downhill = s.runs?.byActivity?.downhill?.byDifficulty ?? {}
    const runKm = Object.values(downhill).reduce((sum, d) => sum + (d.lengthInKm ?? 0), 0)
    const lifts = Object.values(s.lifts?.byType ?? {}).reduce((sum, t) => sum + (t.count ?? 0), 0)
    out.push({
      osmId: p.id,
      name: p.name.trim(),
      cc: (place?.iso3166_1Alpha2 ?? '').toUpperCase(),
      country: en?.country ?? '',
      region: en?.region ?? '',
      locality: en?.locality ?? '',
      lon: c[0],
      lat: c[1],
      base: Math.round(s.minElevation),
      top: Math.round(s.maxElevation),
      vert: Math.round(s.maxElevation - s.minElevation),
      runKm: Math.round(runKm * 10) / 10,
      lifts,
      website: p.websites?.[0] ?? '',
    })
  }
  return out
}
