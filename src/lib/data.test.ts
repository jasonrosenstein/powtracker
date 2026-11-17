import { describe, expect, it } from 'vitest'
import { applyFilters, biggestStorm, confidenceOf, distanceKm, measuredDepth, measuredFall, snowOf, sortRows, spreadOf, valueOf, type Filters, type Row } from './data.ts'
import { snowClass, snowColor, snowRadius, snowScale } from './scale.ts'
import type { Observation, ResortForecast } from './types.ts'

function forecast(mid7: number | null, over: Partial<ResortForecast> = {}): ResortForecast {
  return {
    w: [[1, 2, 3], [10, mid7, 30], [20, 40, 60]],
    lo: [[0, 0, 0], [5, 8, 12], [9, 20, 30]],
    hi: [[2, 4, 6], [15, 32, 48], [30, 60, 90]],
    n: [9, 7, 4],
    d: [[], [], []],
    p: [[0, 1], [2, 5], [4, 9]],
    mm: [],
    t: [-5, 0],
    d0: '2026-11-16',
    ...over,
  }
}

function row(n: string, b: number, t: number, opts: { f?: ResortForecast; p?: string[]; cc?: string; region?: Row['region'] } = {}): Row {
  return {
    r: { id: n, n, cc: opts.cc ?? 'US', co: 'United States', rg: 'Utah', la: 0, lo: 0, b, t, km: 10, li: 3, p: opts.p ?? [] },
    f: opts.f,
    o: undefined,
    vert: t - b,
    region: opts.region ?? 'North America',
    search: `${n} utah united states`.toLowerCase(),
  }
}

const NONE: Filters = { passes: [], region: '', minVert: 0, query: '' }

describe('snowOf', () => {
  const f = forecast(20)
  it('reads each window at each level', () => {
    expect(snowOf(f, 'w3', 'base')).toBe(1)
    expect(snowOf(f, 'w7', 'mid')).toBe(20)
    expect(snowOf(f, 'w14', 'top')).toBe(60)
  })
  it('reads past snowfall', () => {
    expect(snowOf(f, 'p24', 'mid')).toBe(2)
    expect(snowOf(f, 'p72', 'top')).toBe(9)
  })
  it('is null without a forecast', () => {
    expect(snowOf(undefined, 'w7', 'mid')).toBeNull()
  })
})

describe('spreadOf', () => {
  it('gives the model range and count for a forecast window', () => {
    expect(spreadOf(forecast(20), 'w7', 'mid')).toEqual({ lo: 8, hi: 32, n: 7 })
  })
  it('has none for past snowfall', () => {
    expect(spreadOf(forecast(20), 'p24', 'mid')).toBeNull()
  })
})

describe('measured snow', () => {
  const NOW = Date.parse('2026-11-17T12:00:00Z')
  const reading = (k: Observation['k'], v: number, hoursAgo: number): Observation => ({ k, v, at: new Date(NOW - hoursAgo * 3_600_000).toISOString(), st: 'Station', z: 2000, km: 3, src: 'Test' })
  const withObs = (...o: Observation[]): Row => ({ ...row('M', 1000, 2000, { f: forecast(20) }), o })

  it('ranks fallen snow by a fresh station reading, and by the model estimate without one', () => {
    expect(valueOf(withObs(reading('new24', 18, 5)), 'p24', 'mid', NOW)).toBe(18)
    expect(valueOf(withObs(), 'p24', 'mid', NOW)).toBe(2)
    expect(valueOf(row('M', 1000, 2000, { f: forecast(20) }), 'p72', 'mid', NOW)).toBe(5)
  })
  it('prefers measured new snow to a change in depth', () => {
    const r = withObs(reading('change24', 9, 2), reading('new24', 14, 6))
    expect(measuredFall(r, 'p24', NOW)?.k).toBe('new24')
    expect(measuredFall(withObs(reading('change24', 9, 2)), 'p24', NOW)?.v).toBe(9)
  })
  it('does not pass a stale reading off as the last 24 hours', () => {
    const r = withObs(reading('new24', 30, 50))
    expect(measuredFall(r, 'p24', NOW)).toBeNull()
    expect(valueOf(r, 'p24', 'mid', NOW)).toBe(2)
  })
  it('never replaces a forecast with a measurement', () => {
    expect(valueOf(withObs(reading('new24', 18, 5)), 'w7', 'mid', NOW)).toBe(20)
    expect(measuredFall(withObs(reading('new24', 18, 5)), 'w7', NOW)).toBeNull()
  })
  it('reads snow on the ground, and sorts by it with unmeasured mountains last', () => {
    const deep = { ...withObs(reading('depth', 120, 3)), r: { ...withObs().r, n: 'Deep' } }
    const shallow = { ...withObs(reading('depth', 40, 3)), r: { ...withObs().r, n: 'Shallow' } }
    const none = { ...withObs(), r: { ...withObs().r, n: 'None' } }
    expect(measuredDepth(deep)?.v).toBe(120)
    expect(measuredDepth(none)).toBeNull()
    expect(sortRows([none, shallow, deep], 'depth', true, 'w7', 'mid').map((r) => r.r.n)).toEqual(['Deep', 'Shallow', 'None'])
  })
})

describe('confidenceOf', () => {
  // Each model's [3 d, 7 d, 14 d] totals at mid elevation, around a 7-day consensus of 20 cm.
  const withModels = (sevenDay: number[]) => forecast(20, { mm: sevenDay.map((v) => [v, v, v]) })
  it('is high when the middle half of the models sit close to the consensus', () => {
    expect(confidenceOf(withModels([18, 19, 20, 21, 22]), 'w7')?.level).toBe(3)
  })
  it('is medium when they span up to the total itself, low beyond', () => {
    expect(confidenceOf(withModels([8, 12, 20, 28, 32]), 'w7')?.level).toBe(2)
    expect(confidenceOf(withModels([0, 2, 20, 45, 60]), 'w7')?.level).toBe(1)
  })
  it('never rates a 14-day total above medium', () => {
    const f = forecast(20, { w: [[1, 2, 3], [10, 20, 20], [20, 40, 60]], mm: [[20, 20, 20], [20, 20, 20], [20, 20, 20]] })
    expect(confidenceOf(f, 'w7')?.level).toBe(3)
    expect(confidenceOf(f, 'w14')?.level).toBe(2)
  })
  it('has no rating for past snowfall or with too few models', () => {
    expect(confidenceOf(withModels([18, 20, 22]), 'p24')).toBeNull()
    expect(confidenceOf(withModels([18, 22]), 'w7')).toBeNull()
    expect(confidenceOf(undefined, 'w7')).toBeNull()
  })
})

describe('biggestStorm', () => {
  const days = (cm: (number | null)[]) => cm.map((mean, i) => ({ date: `2026-11-${String(17 + i).padStart(2, '0')}`, mean }))
  it('finds the run of snowy days with the largest total, and its heaviest day', () => {
    expect(biggestStorm(days([0, 5, 12, 8, 0, 1, 30, 0]))).toEqual({ from: '2026-11-23', to: '2026-11-23', totalCm: 30, peak: { date: '2026-11-23', cm: 30 } })
    expect(biggestStorm(days([0, 5, 12, 8, 0, 3, 20, 0]))).toEqual({ from: '2026-11-18', to: '2026-11-20', totalCm: 25, peak: { date: '2026-11-19', cm: 12 } })
  })
  it('ignores dustings and days with no forecast', () => {
    expect(biggestStorm(days([0, 1, 1.5, null, 0]))).toBeNull()
  })
})

describe('distanceKm', () => {
  it('measures along the globe', () => {
    // Denver to Salt Lake City is about 600 km.
    const d = distanceKm({ lat: 39.74, lon: -104.99 }, 40.76, -111.89)
    expect(d).toBeGreaterThan(580)
    expect(d).toBeLessThan(620)
    expect(distanceKm({ lat: 46, lon: 7 }, 46, 7)).toBe(0)
  })
})

describe('applyFilters', () => {
  const rows = [
    row('Alta', 2600, 3200, { p: ['ikon'] }),
    row('Vail', 2475, 3527, { p: ['epic'] }),
    row('Zermatt', 1560, 3880, { p: ['ikon'], region: 'Europe' }),
    row('Hill', 300, 420),
  ]
  const names = (f: Partial<Filters>) => applyFilters(rows, { ...NONE, ...f }).map((r) => r.r.n)
  it('keeps everything with no filters', () => {
    expect(names({})).toHaveLength(4)
  })
  it('matches a mountain on any of the chosen passes', () => {
    expect(names({ passes: ['ikon'] })).toEqual(['Alta', 'Zermatt'])
    expect(names({ passes: ['ikon', 'epic'] })).toEqual(['Alta', 'Vail', 'Zermatt'])
  })
  it('combines pass, region, size and search', () => {
    expect(names({ passes: ['ikon'], region: 'Europe' })).toEqual(['Zermatt'])
    expect(names({ minVert: 1000 })).toEqual(['Vail', 'Zermatt'])
    expect(names({ query: '  VAI ' })).toEqual(['Vail'])
  })
})

describe('sortRows', () => {
  const rows = [
    row('A', 1000, 2000, { f: forecast(20) }),
    row('B', 500, 2500, { f: forecast(50) }),
    row('C', 1500, 1900, { f: forecast(null) }),
    row('D', 2000, 3000),
  ]
  const order = (...args: Parameters<typeof sortRows> extends [unknown, ...infer R] ? R : never) => sortRows(rows, ...args).map((r) => r.r.n)
  it('ranks by snowfall, with mountains that have no figure last', () => {
    expect(order('snow', true, 'w7', 'mid')).toEqual(['B', 'A', 'D', 'C'])
  })
  it('keeps mountains with no figure last when the order is reversed', () => {
    expect(order('snow', false, 'w7', 'mid').slice(0, 2)).toEqual(['A', 'B'])
  })
  it('sorts by vertical drop, base and summit', () => {
    expect(order('vert', true, 'w7', 'mid')).toEqual(['B', 'A', 'D', 'C'])
    expect(order('base', true, 'w7', 'mid')).toEqual(['D', 'C', 'A', 'B'])
    expect(order('top', false, 'w7', 'mid')).toEqual(['C', 'A', 'B', 'D'])
  })
  it('sorts by name', () => {
    expect(order('name', false, 'w7', 'mid')).toEqual(['A', 'B', 'C', 'D'])
  })
  it('sorts by distance from the viewer, nearest first', () => {
    const spots = [row('Far', 0, 1000), row('Near', 0, 500), row('Mid', 0, 800)]
    spots[0].r.la = 60
    spots[1].r.la = 41
    spots[2].r.la = 50
    expect(sortRows(spots, 'near', false, 'w7', 'mid', { lat: 40, lon: 0 }).map((r) => r.r.n)).toEqual(['Near', 'Mid', 'Far'])
  })
  it('breaks ties on vertical drop', () => {
    // A and D tie on summit level 14-day snowfall only when both have forecasts: give D one.
    const tied = [row('Small', 1000, 1400, { f: forecast(20) }), row('Big', 1000, 2400, { f: forecast(20) })]
    expect(sortRows(tied, 'snow', true, 'w7', 'mid').map((r) => r.r.n)).toEqual(['Big', 'Small'])
  })
})

describe('snow scale', () => {
  const metric = snowScale(false, 'metric')
  const imperial = snowScale(false, 'imperial')
  it('puts totals in the class whose lower bound they reach', () => {
    expect(snowClass(0.5, metric)).toBe(-1)
    expect(snowClass(1, metric)).toBe(0)
    expect(snowClass(29.9, metric)).toBe(2)
    expect(snowClass(30, metric)).toBe(3)
    expect(snowClass(500, metric)).toBe(5)
    expect(snowClass(null, metric)).toBe(-1)
  })
  it('uses round inch bounds for imperial units', () => {
    expect(imperial.labels).toEqual(['0.5', '2', '6', '12', '24', '40'])
    expect(imperial.breaksCm[3]).toBeCloseTo(30.48)
  })
  it('colours and sizes by class', () => {
    expect(snowColor(0, metric)).toBe(metric.none)
    expect(snowColor(200, metric)).toBe(metric.ramp[5])
    expect(snowRadius(0, metric)).toBe(3)
    expect(snowRadius(100, metric)).toBeGreaterThan(snowRadius(10, metric))
    expect(snowRadius(10000, metric)).toBe(22)
  })
  it('reverses the ramp on a dark surface so deep snow stays the strongest mark', () => {
    expect(snowScale(true, 'metric').ramp[5]).not.toBe(metric.ramp[5])
  })
})
