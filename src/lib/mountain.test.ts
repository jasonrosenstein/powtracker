import { describe, expect, it } from 'vitest'
import { inPolygon } from './avalanche.ts'
import { compass, parseMountainWeather, skyOf, windAdvice } from './mountain-weather.ts'
import { liveFeedFor, openState, parseFeed, tally } from './status.ts'
import { classOf, decodeLine, decodeTrails, difficultyClasses, encodeLine, lineLength, nameKey, simplify, type LonLat } from './trails.ts'
import { RUN_FLAGS } from './types.ts'

describe('trail lines', () => {
  const line: LonLat[] = [[-105.76251, 39.88412], [-105.76198, 39.88377], [-105.7603, 39.88291]]
  it('survive packing to within a metre', () => {
    const back = decodeLine(encodeLine(line))
    expect(back).toHaveLength(3)
    back.forEach(([lon, lat], i) => {
      expect(lon).toBeCloseTo(line[i][0], 5)
      expect(lat).toBeCloseTo(line[i][1], 5)
    })
  })
  it('pack as small steps after the first point', () => {
    const packed = encodeLine(line)
    expect(packed.slice(0, 2)).toEqual([-10576251, 3988412])
    expect(Math.abs(packed[2])).toBeLessThan(200)
  })
  it('measure length along the ground', () => {
    // One thousandth of a degree of latitude is about 111 m.
    expect(lineLength([[7, 46], [7, 46.001]])).toBeGreaterThan(110)
    expect(lineLength([[7, 46], [7, 46.001]])).toBeLessThan(112)
    expect(lineLength([[7, 46]])).toBe(0)
  })
  it('lose the points that do not bend them, and keep the ones that do', () => {
    const straight: LonLat[] = [[0, 0], [0.0001, 0.00000001], [0.0002, 0], [0.0003, 0]]
    expect(simplify(straight)).toEqual([[0, 0], [0.0003, 0]])
    const bent: LonLat[] = [[0, 0], [0.001, 0.001], [0.002, 0]]
    expect(simplify(bent)).toHaveLength(3)
  })
})

describe('difficulty by convention', () => {
  it('uses green, blue, black and double black in North America', () => {
    const na = { rc: 'n' as const }
    expect(difficultyClasses(na).map((c) => c.label)).toEqual(['Green', 'Blue', 'Black', 'Double black', 'Extreme', 'Unrated'])
    expect(difficultyClasses(na)[classOf(1, na)]).toMatchObject({ label: 'Green', shape: 'circle' })
    expect(difficultyClasses(na)[classOf(2, na)]).toMatchObject({ label: 'Blue', shape: 'square' })
    expect(difficultyClasses(na)[classOf(4, na)].label).toBe('Double black')
  })
  it('uses blue, red and black in Europe, where blue is the easy run', () => {
    const eu = {}
    expect(difficultyClasses(eu)[classOf(1, eu)].label).toBe('Blue')
    expect(difficultyClasses(eu)[classOf(2, eu)].label).toBe('Red')
    expect(difficultyClasses(eu)[classOf(4, eu)].label).toBe('Black')
  })
  it('has no blue in Japan', () => {
    const jp = { rc: 'j' as const }
    expect(difficultyClasses(jp).map((c) => c.label)).not.toContain('Blue')
    expect(difficultyClasses(jp)[classOf(2, jp)].label).toBe('Red')
  })
  it('decodes a mountain file into runs, lifts and their bounds', () => {
    const t = decodeTrails({ r: [['Parkway', 2, RUN_FLAGS.groomed | RUN_FLAGS.lit, 1200, 300, encodeLine([[1, 2], [1.01, 2.02]])]], l: [['Gondola', 'gondola', 2000, 600, encodeLine([[0.99, 1.98], [1.02, 2.01]])]] }, { rc: 'n' })
    expect(t.runs[0]).toMatchObject({ name: 'Parkway', cls: 1, groomed: true, lit: true, gladed: false, area: false })
    expect(t.lifts[0]).toMatchObject({ name: 'Gondola', type: 'gondola', verticalM: 600 })
    expect(t.bounds).toEqual([0.99, 1.98, 1.02, 2.02])
  })
})

describe('nameKey', () => {
  it('matches the same run named two ways', () => {
    expect(nameKey('Upper Parkway Trail')).toBe(nameKey('Parkway (Upper)'))
    expect(nameKey("Mary Jane's Trail")).toBe(nameKey('Mary Janes'))
    expect(nameKey('Super Gauge Express')).toBe(nameKey('Super Gauge'))
    expect(nameKey('Côte d’Azur')).toBe(nameKey('Cote dAzur'))
  })
  it('keeps different runs apart', () => {
    expect(nameKey('Upper Parkway')).not.toBe(nameKey('Lower Parkway'))
  })
})

describe('live status', () => {
  it('reduces the resort wording to four states', () => {
    expect(openState('Open')).toBe('open')
    expect(openState('Closed for Season')).toBe('closed')
    expect(openState('On Hold')).toBe('hold')
    expect(openState('Wind Hold')).toBe('hold')
    expect(openState('Scheduled')).toBe('scheduled')
    expect(openState('something new')).toBe('closed')
  })
  it('reads lifts, trails, snow and notices from a feed', () => {
    const s = parseFeed(
      {
        Name: 'Test Peak',
        OperatingStatus: 'Open',
        LastUpdate: '2026-11-17T07:38:41-0700',
        SnowReport: { Alert: '<div>Opening day <b>Saturday</b></div>', SeasonTotalCm: '25', MidMountainArea: { Name: 'Mid-Mountain', BaseCm: '46', Last24HoursCm: '0', Last72HoursCm: '3', Last7DaysCm: '3' } },
        MountainAreas: [
          {
            Name: 'Front',
            Lifts: [{ Name: 'Gondola', Status: 'Open', LiftType: 'Gondola', Hours: { Tuesday: { Open: '8:30 AM', Close: '4:00 PM' } }, WaitTime: '--' }],
            Trails: [
              { Name: 'Easy Street', Status: 'Open', TrailIcon: 'GreenCircle', Grooming: 'Yes' },
              { Name: 'The Chute', Status: 'Closed', TrailIcon: 'DoubleBlackDiamond', Grooming: 'No' },
            ],
          },
        ],
        ParkingLots: [{ Name: 'G Lot' }],
      },
      new Date('2026-11-17T12:00:00'),
    )
    expect(s.operating).toBe('Open')
    expect(s.lifts[0]).toMatchObject({ name: 'Gondola', state: 'open', hours: '8:30 AM – 4:00 PM', wait: '' })
    expect(s.trails.map((t) => [t.rating, t.state, t.groomed])).toEqual([['Green', 'open', true], ['Double black', 'closed', false]])
    expect(tally(s.trails)).toEqual({ open: 1, total: 2 })
    expect(s.snow).toMatchObject({ at: 'Mid-Mountain', baseCm: 46, last24Cm: 0, last72Cm: 3, seasonCm: 25, last48Cm: null })
    expect(s.alert).toBe('Opening day Saturday')
    expect(s.parking).toEqual(['G Lot'])
  })
  it('knows which mountains have a feed', () => {
    expect(liveFeedFor({ id: 'eac3283b' })).toBe(5)
    expect(liveFeedFor({ id: 'eac3283b9f' })).toBe(5)
    expect(liveFeedFor({ id: '00000000' })).toBeNull()
  })
})

describe('mountain weather', () => {
  it('names the sky from a weather code', () => {
    expect([0, 2, 3, 45, 71, 75, 61, 95].map(skyOf)).toEqual(['clear', 'partly', 'cloudy', 'fog', 'snow', 'heavy-snow', 'rain', 'storm'])
  })
  it('names the wind by where it comes from', () => {
    expect([0, 44, 90, 225, 359].map(compass)).toEqual(['N', 'NE', 'E', 'SW', 'N'])
  })
  it('warns about lifts as gusts rise', () => {
    expect(windAdvice(30).level).toBe(0)
    expect(windAdvice(60).level).toBe(1)
    expect(windAdvice(95).level).toBe(2)
  })
  it('keeps the next 48 hours and works out the base temperature', () => {
    const start = Date.UTC(2026, 10, 17, 0)
    const time = Array.from({ length: 72 }, (_, i) => new Date(start + i * 3_600_000).toISOString().slice(0, 16))
    const fill = (v: number) => time.map(() => v)
    const w = parseMountainWeather(
      {
        utc_offset_seconds: 0,
        hourly: { time, temperature_2m: fill(-8), apparent_temperature: fill(-15), wind_speed_10m: fill(30), wind_gusts_10m: fill(62), wind_direction_10m: fill(315), weather_code: fill(73), visibility: fill(800), is_day: fill(1) },
        daily: { sunrise: ['2026-11-17T07:12'], sunset: ['2026-11-17T16:48'] },
      },
      { b: 2000, t: 3000 },
      start + 5.5 * 3_600_000,
    )
    expect(w.hours[0].hour).toBe(5)
    expect(w.hours).toHaveLength(49)
    expect(w.hours[0]).toMatchObject({ tempTop: -8, feelsTop: -15, gust: 62, from: 'NW', sky: 'snow', isDay: true })
    expect(w.hours[0].tempBase).toBeCloseTo(-1.5)
    expect(w.sunrise).toBe('07:12')
  })
})

describe('inPolygon', () => {
  const square: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]
  const hole: [number, number][] = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]
  it('finds points inside and outside', () => {
    expect(inPolygon(5, 2, [square])).toBe(true)
    expect(inPolygon(15, 5, [square])).toBe(false)
  })
  it('treats a hole as outside', () => {
    expect(inPolygon(5, 5, [square, hole])).toBe(false)
    expect(inPolygon(2, 2, [square, hole])).toBe(true)
  })
})
