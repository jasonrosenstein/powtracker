// Trail maps: how a mountain's runs and lifts are packed for download, how difficulty is named
// and coloured in each part of the world, and how run names are compared between sources.
import type { Resort, TrailsFile } from './types.ts'
import { RUN_FLAGS } from './types.ts'

export type LonLat = [number, number]

/** OpenSkiMap's difficulty levels, in the order runs store them (index = stored value). */
export const DIFFICULTIES = ['novice', 'easy', 'intermediate', 'advanced', 'expert', 'freeride', 'extreme', 'other'] as const

/** Pack a line as integers of 1e-5 degrees: the first point absolute, then the step to each next point. */
export function encodeLine(points: readonly LonLat[]): number[] {
  const out: number[] = []
  let px = 0
  let py = 0
  for (const [lon, lat] of points) {
    const x = Math.round(lon * 1e5)
    const y = Math.round(lat * 1e5)
    out.push(x - px, y - py)
    px = x
    py = y
  }
  return out
}

export function decodeLine(packed: readonly number[]): LonLat[] {
  const out: LonLat[] = []
  let x = 0
  let y = 0
  for (let i = 0; i + 1 < packed.length; i += 2) {
    x += packed[i]
    y += packed[i + 1]
    out.push([x / 1e5, y / 1e5])
  }
  return out
}

/** Great-circle length of a line, metres. */
export function lineLength(points: readonly LonLat[]): number {
  const rad = Math.PI / 180
  let m = 0
  for (let i = 1; i < points.length; i++) {
    const [lon1, lat1] = points[i - 1]
    const [lon2, lat2] = points[i]
    const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2
    m += 12_742_000 * Math.asin(Math.sqrt(a))
  }
  return m
}

/**
 * Drop points that bend a line by less than `tolerance` degrees (Douglas-Peucker), keeping its
 * ends. At 4e-5 degrees, about 4 m, a run keeps its shape at any zoom a phone will reach.
 */
export function simplify<T extends readonly (number | undefined)[]>(points: readonly T[], tolerance = 4e-5): T[] {
  if (points.length <= 2) return [...points]
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const [ax, ay] = points[a] as unknown as LonLat
    const [bx, by] = points[b] as unknown as LonLat
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    let worst = -1
    let worstD = tolerance * tolerance
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i] as unknown as LonLat
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
      const d = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
      if (d > worstD) {
        worstD = d
        worst = i
      }
    }
    if (worst > 0) {
      keep[worst] = 1
      stack.push([a, worst], [worst, b])
    }
  }
  return points.filter((_, i) => keep[i])
}

export type Shape = 'circle' | 'square' | 'diamond' | 'double'

export interface DifficultyClass {
  id: string
  label: string
  color: string
  /** North American maps pair each colour with a shape; elsewhere every class is a disc. */
  shape: Shape
}

const GREEN = '#2f9e52'
const BLUE = '#2a78d6'
const RED = '#d6403a'
const BLACK = '#15181e'
const ORANGE = '#e07b1a'
const GREY = '#8792a3'

const FREERIDE: DifficultyClass = { id: 'freeride', label: 'Freeride', color: ORANGE, shape: 'diamond' }
const UNRATED: DifficultyClass = { id: 'unrated', label: 'Unrated', color: GREY, shape: 'circle' }

/**
 * The classes a skier would recognise on the mountain's own map. North America: green circle,
 * blue square, black diamond, double black. Europe: green, blue, red, black. Japan: green, red,
 * black. The colours are the convention itself, so each is always shown with its name too.
 */
const CLASSES: Record<'e' | 'n' | 'j', { classes: DifficultyClass[]; of: number[] }> = {
  n: {
    classes: [
      { id: 'green', label: 'Green', color: GREEN, shape: 'circle' },
      { id: 'blue', label: 'Blue', color: BLUE, shape: 'square' },
      { id: 'black', label: 'Black', color: BLACK, shape: 'diamond' },
      { id: 'double', label: 'Double black', color: BLACK, shape: 'double' },
      { ...FREERIDE, label: 'Extreme' },
      UNRATED,
    ],
    of: [0, 0, 1, 2, 3, 4, 4, 5],
  },
  e: {
    classes: [
      { id: 'green', label: 'Green', color: GREEN, shape: 'circle' },
      { id: 'blue', label: 'Blue', color: BLUE, shape: 'circle' },
      { id: 'red', label: 'Red', color: RED, shape: 'circle' },
      { id: 'black', label: 'Black', color: BLACK, shape: 'circle' },
      FREERIDE,
      UNRATED,
    ],
    of: [0, 1, 2, 3, 3, 4, 4, 5],
  },
  j: {
    classes: [
      { id: 'green', label: 'Green', color: GREEN, shape: 'circle' },
      { id: 'red', label: 'Red', color: RED, shape: 'circle' },
      { id: 'black', label: 'Black', color: BLACK, shape: 'circle' },
      FREERIDE,
      UNRATED,
    ],
    of: [0, 0, 1, 2, 2, 3, 3, 4],
  },
}

export function difficultyClasses(resort: Pick<Resort, 'rc'>): DifficultyClass[] {
  return CLASSES[resort.rc ?? 'e'].classes
}

/** Index into difficultyClasses() for a stored difficulty value. */
export function classOf(difficulty: number, resort: Pick<Resort, 'rc'>): number {
  const c = CLASSES[resort.rc ?? 'e']
  return c.of[difficulty] ?? c.classes.length - 1
}

export interface Run {
  name: string
  /** Index into difficultyClasses(). */
  cls: number
  groomed: boolean
  ungroomed: boolean
  lit: boolean
  gladed: boolean
  lengthM: number
  verticalM: number
  line: LonLat[]
  /** True when the geometry outlines an area (a bowl, a park) instead of tracing a line. */
  area: boolean
}

export interface Lift {
  name: string
  type: string
  lengthM: number
  verticalM: number
  line: LonLat[]
}

export interface Trails {
  runs: Run[]
  lifts: Lift[]
  /** [west, south, east, north] of everything mapped. */
  bounds: [number, number, number, number] | null
}

export function decodeTrails(file: TrailsFile, resort: Pick<Resort, 'rc'>): Trails {
  const runs: Run[] = file.r.map(([name, d, flags, lengthM, verticalM, packed, area]) => ({
    name,
    cls: classOf(d, resort),
    groomed: (flags & RUN_FLAGS.groomed) !== 0,
    ungroomed: (flags & RUN_FLAGS.ungroomed) !== 0,
    lit: (flags & RUN_FLAGS.lit) !== 0,
    gladed: (flags & RUN_FLAGS.gladed) !== 0,
    lengthM,
    verticalM,
    line: decodeLine(packed),
    area: area === 1,
  }))
  const lifts: Lift[] = file.l.map(([name, type, lengthM, verticalM, packed]) => ({ name, type, lengthM, verticalM, line: decodeLine(packed) }))
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
  for (const item of [...runs, ...lifts]) {
    for (const [lon, lat] of item.line) {
      if (lon < w) w = lon
      if (lon > e) e = lon
      if (lat < s) s = lat
      if (lat > n) n = lat
    }
  }
  return { runs, lifts, bounds: Number.isFinite(w) ? [w, s, e, n] : null }
}

const LIFT_NAMES: Record<string, string> = {
  chair_lift: 'Chairlift',
  gondola: 'Gondola',
  cable_car: 'Cable car',
  mixed_lift: 'Chair and gondola',
  drag_lift: 'Drag lift',
  't-bar': 'T-bar',
  'j-bar': 'J-bar',
  platter: 'Platter lift',
  rope_tow: 'Rope tow',
  magic_carpet: 'Magic carpet',
  funicular: 'Funicular',
  railway: 'Railway',
}

export function liftTypeName(type: string): string {
  return LIFT_NAMES[type] ?? type.replace(/[_-]/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

/**
 * A run or lift name reduced to what two sources would agree on: lower case, no accents or
 * punctuation, and without the words resorts add or drop freely ("Upper Parkway Trail" and
 * "Parkway (upper)" both become "parkway upper").
 */
export function nameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !['the', 'trail', 'run', 'lift', 'chair', 'chairlift', 'express', 'quad', 'triple', 'double', 'six', 'pack', 'high', 'speed'].includes(w))
    .sort()
    .join(' ')
}
