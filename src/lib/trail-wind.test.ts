import { describe, expect, it } from 'vitest'
import { blowingTo, exposure, offset, relativeWind, routeChord } from './trail-wind.ts'
import { isRecentWind, speedKmh } from './wind-stations.ts'
import { parseMountainWeather } from './mountain-weather.ts'
import type { LonLat } from './trails.ts'

const w:LonLat=[-106.34,39.6], e=offset(w,90,1000)
describe('wind on the lift and trail map',()=>{
  it('draws incoming west wind toward the east, and handles north wrap',()=>{
    expect(blowingTo(270)).toBe(90); expect(blowingTo(359)).toBe(179); expect(blowingTo(180)).toBe(0)
  })
  it('compares local travel direction with incoming wind, independent of stored line order',()=>{
    expect(relativeWind([w,e],1000,1200,true,270)).toContain('Tailwind riding up')
    expect(relativeWind([e,w],1200,1000,true,270)).toContain('Tailwind riding up')
    expect(relativeWind([w,e],1000,1200,false,270)).toContain('Headwind skiing down')
    expect(relativeWind([w,e],1000,1200,true,0)).toContain('Crosswind')
    expect(relativeWind([w,e],1000,1003,false,180)).toBeNull()
  })
  it('takes its heading at the tap, not diagonally across a switchback',()=>{
    const bend=offset(e,0,500), tap=offset(e,0,250)
    const [a,b]=routeChord([w,w,e,bend],tap)!
    expect(a[0]).toBeCloseTo(e[0],7);expect(b[0]).toBeCloseTo(e[0],7);expect(b[1]).toBeGreaterThan(a[1])
    expect(routeChord([w,w],w)).toBeNull()
  })
  it('separates windward, lee, crest, and uncertain terrain',()=>{
    expect(exposure(1000,1020,1040)).toContain('Wind-facing');expect(exposure(1040,1020,1000)).toContain('Lee-facing');expect(exposure(1000,1040,1010)).toContain('crest');expect(exposure(1010,1000,1020)).toContain('hollow');expect(exposure(1000,1001,1003)).toContain('uncertain')
  })
  it('does not turn missing or invalid wind into calm, a gust, or north',()=>{
    const time=['2026-11-24T08:00','2026-11-24T09:00','2026-11-24T10:00']
    const w=parseMountainWeather({utc_offset_seconds:0,daily:{sunrise:[],sunset:[]},hourly:{time,temperature_2m:[1,2,3],apparent_temperature:[1,2,3],wind_speed_10m:[null,0,15],wind_gusts_10m:[null,0,20],wind_direction_10m:[null,360,999],weather_code:[0,0,0],is_day:[1,1,1],visibility:[1,2,3]}},{b:500,t:1400},Date.parse(time[0]+'Z'))
    expect(w.hours[0]).toMatchObject({wind:null,gust:null,fromDegrees:null,from:''});expect(w.hours[1]).toMatchObject({wind:0,gust:0,from:''});expect(w.hours[2].fromDegrees).toBeNull()
  })
  it('normalizes known observation units, rejects bad/missing sensors and expired observations',()=>{
    expect(speedKmh({value:10,unitCode:'wmoUnit:m_s-1'})).toBe(36);expect(speedKmh({value:0,unitCode:'wmoUnit:km_h-1'})).toBe(0)
    expect(speedKmh({value:null,unitCode:'wmoUnit:km_h-1'})).toBeNull();expect(speedKmh({value:10,unitCode:'unknown'})).toBeNull();expect(speedKmh({value:12,unitCode:'wmoUnit:m_s-1',qualityControl:'X'})).toBeNull()
    const now=Date.now();expect(isRecentWind(now-3600e3,now)).toBe(true);expect(isRecentWind(now-3*3600e3,now)).toBe(false);expect(isRecentWind(now+3600e3,now)).toBe(false)
  })
})
