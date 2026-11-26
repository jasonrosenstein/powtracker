import { expect, it } from 'vitest'
import { dailyPeakWind } from './daily-wind.ts'
import { fmtRainNum } from './units.ts'

const day = (date: string) => Array.from({length: 24}, (_, i) => `${date}T${String(i).padStart(2, '0')}:00`)

it('pairs the daily maximum with the direction at that hour, keyed by mountain-local date', () => {
  const time = [...day('2026-11-25'), ...day('2026-11-26')]
  const speed = time.map((_, i) => i === 23 ? 33 : i === 24 ? 49 : 4)
  const dir = time.map((_, i) => i === 23 ? 359 : 1)
  expect(dailyPeakWind({time, wind_speed_10m: speed, wind_direction_10m: dir})).toEqual({
    '2026-11-25': {kmh: 33, fromDegrees: 359}, '2026-11-26': {kmh: 49, fromDegrees: 1},
  })
})

it('distinguishes calm, unknown direction, and missing or truncated speed coverage', () => {
  const time = day('2026-11-25')
  const check = (speed: (number | null)[], dir?: (number | null)[]) => dailyPeakWind({time, wind_speed_10m: speed, wind_direction_10m: dir})['2026-11-25']
  expect(check(time.map(() => 0), time.map(() => 30))).toEqual({kmh: 0, fromDegrees: null})
  expect(check(time.map(() => 17))).toEqual({kmh: 17, fromDegrees: null})
  expect(check(time.map(() => 17), time.map(() => 360))).toEqual({kmh: 17, fromDegrees: 0})
  expect(check(time.map((_, i) => i === 9 ? null : 0))).toBeUndefined()
  expect(dailyPeakWind({time: time.slice(0, 19), wind_speed_10m: time.map(() => 0)})).toEqual({})
})

it('displays liquid depth with rain precision in either unit system', () => {
  expect(fmtRainNum(25.4, 'imperial')).toBe('1')
  expect(fmtRainNum(0.05, 'metric')).toBe('<0.1')
  expect(fmtRainNum(0.05, 'imperial')).toBe('<0.01')
  expect(fmtRainNum(0, 'imperial')).toBe('0')
  expect(fmtRainNum(null, 'metric')).toBe('–')
})
