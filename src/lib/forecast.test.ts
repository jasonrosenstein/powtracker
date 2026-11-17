import { describe, expect, it } from 'vitest'
import { dayStartIndex, nowIndex, parseHourly, snowAtLevel, summarise, timeAt, windowTotal, type OpenMeteoLocation } from './forecast.ts'
import { PAST_DAYS } from './models.ts'

const HOURS = (PAST_DAYS + 15) * 24

/** A location in UTC-7 whose series start at local midnight on 2026-11-13. */
function location(models: Record<string, { precip: (h: number) => number | null; temp: (h: number) => number | null }>): OpenMeteoLocation {
  const start = Date.UTC(2026, 10, 13)
  const time = Array.from({ length: HOURS }, (_, i) => new Date(start + i * 3_600_000).toISOString().slice(0, 16))
  const hourly: OpenMeteoLocation['hourly'] = { time }
  for (const [id, m] of Object.entries(models)) {
    hourly[`precipitation_${id}`] = time.map((_, i) => m.precip(i))
    hourly[`temperature_2m_${id}`] = time.map((_, i) => m.temp(i))
  }
  return { elevation: 2000, utc_offset_seconds: -7 * 3600, hourly }
}

// 09:30 local on 2026-11-16, three days after the series start.
const NOW = Date.UTC(2026, 10, 16, 16, 30)

describe('time indexing', () => {
  const h = parseHourly(location({ a: { precip: () => 0, temp: () => 0 } }), ['a'])
  it('maps an index to UTC through the location offset', () => {
    expect(new Date(timeAt(h, 0)).toISOString()).toBe('2026-11-13T07:00:00.000Z')
  })
  it('finds the last fully elapsed hour', () => {
    // 09:30 local: the 09:00 stamp (index 72 + 9) has elapsed, 10:00 has not.
    expect(nowIndex(h, NOW)).toBe(dayStartIndex(0) + 9)
  })
})

describe('windowTotal', () => {
  it('uses every model while it lasts and never steps down when one drops out', () => {
    // Model a snows 1 mm an hour throughout; model b snows 3 mm an hour but stops after 100 h.
    const h = parseHourly(
      location({
        a: { precip: () => 1, temp: () => -2 },
        b: { precip: (i) => (i < 100 ? 3 : null), temp: (i) => (i < 100 ? -2 : null) },
      }),
      ['a', 'b'],
    )
    const snow = snowAtLevel(h, 2000, ['a', 'b'])
    // At -2 C, 1 mm of water is 1 cm of snow. Hours 1..99 average 2 cm, later hours 1 cm.
    const t = windowTotal(snow, 0, 200)
    expect(t.mean).toBeCloseTo(99 * 2 + 101 * 1)
    expect(t.n).toBe(1)
    expect(t.byModel).toEqual([200, null])
    // The consensus is above the only full-window model: the range widens to hold it.
    expect(t.lo).toBe(200)
    expect(t.hi).toBeCloseTo(299)
  })
})

describe('summarise', () => {
  it('reports more snow at the summit than at the base in a marginal storm', () => {
    // +2.5 C at 2000 m: rain at a 1500 m base, snow at a 3000 m summit.
    const h = parseHourly(location({ a: { precip: () => 1, temp: () => 2.5 } }), ['a'])
    const f = summarise(h, 1500, 3000, NOW, ['a'])
    expect(f.w[0][0]).toBe(0)
    expect(f.w[2][0]!).toBeGreaterThan(50)
    expect(f.w[1][0]!).toBeLessThan(f.w[2][0]!)
    expect(f.d0).toBe('2026-11-16')
  })
  it('makes each window the sum of its hours and each day a full local day', () => {
    const h = parseHourly(location({ a: { precip: () => 1, temp: () => -2 } }), ['a'])
    const f = summarise(h, 2000, 2000, NOW, ['a'])
    expect(f.w[1]).toEqual([72, 168, 336])
    expect(f.d[1]).toEqual(new Array(14).fill(24))
    expect(f.p[1]).toEqual([24, 72])
    expect(f.n).toEqual([1, 1, 1])
    expect(f.mm).toEqual([[72, 168, 336]])
  })
  it('leaves a window empty when no model reaches its end', () => {
    const h = parseHourly(location({ a: { precip: (i) => (i < 300 ? 1 : null), temp: (i) => (i < 300 ? -2 : null) } }), ['a'])
    const f = summarise(h, 2000, 2000, NOW, ['a'])
    expect(f.w[1][0]).toBe(72)
    expect(f.w[1][2]).toBeNull()
    expect(f.n).toEqual([1, 1, 0])
  })
  it('gives the temperature range at mid elevation', () => {
    const h = parseHourly(location({ a: { precip: () => 0, temp: (i) => (i % 2 ? -4 : -8) } }), ['a'])
    // Mid elevation 2400 m is 400 m above the 2000 m reference: 2.6 C colder.
    const f = summarise(h, 2000, 2800, NOW, ['a'])
    expect(f.t).toEqual([-10.6, -6.6])
  })
})
