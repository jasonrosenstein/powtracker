import { describe, expect, it } from 'vitest'
import { alterraSnow, hakubaSnow, ltsReading, rcrSnow, seliRain, vailSnow, zoned } from './lib/report-parsers.ts'
import { reportAge, showAmount } from '../src/lib/reports.ts'

describe('the sources behind published mountain reports',()=>{
  it('keeps all measured elevations even without base depth; uses snow time, not lift time',()=>{
    const r=alterraSnow({ LastUpdate:'2026-11-25T12:00:00Z', SnowReport:{ LastUpdate:'2026-11-24T06:00:00-0800', MidMountainArea:{Name:'Mid',Last24HoursCm:'0',Last24HoursIn:'0',Last7DaysIn:'--',Last7DaysCm:'0'}, SummitArea:{Last24HoursCm:'8'}, SeasonTotalCm:'95' } })
    expect(r.readings.map(x=>x.place)).toEqual(['Mid','Summit','Resort-wide'])
    expect(r.readings[0].at).toBe('2026-11-24T14:00:00.000Z')
    expect(r.readings[0].values).toEqual({day:{metric:0,inches:0}})
    expect(r.readings[2].values).toEqual({season:{metric:95}})
  })
  const settings={Show12Hr:false,Show24Hr:true,BaseDepth:true,HideSnowReport:false}
  const page=(s:Record<string,unknown>)=>`FR.snowReportSettings = ${JSON.stringify(s)};\nFR.snowReportData = {"LastUpdatedText":"Updated November 24, 2026 at 5:02 AM PST","TwentyFourHourSnowfall":{"Centimeters":"10","Inches":"3"},"OvernightSnowfall":{"Inches":"2"},"BaseDepth":{"Centimeters":"--"}};`
  it('respects the display settings and preserves each published unit',()=>{
    const [r]=vailSnow(page(settings)).readings
    expect(r.at).toBe('2026-11-24T13:02:00.000Z');expect(r.values).toEqual({day:{metric:10,inches:3}})
    expect(showAmount('day',r.values.day!,'imperial')).toBe('3 in')
    expect(vailSnow(page({...settings,HideSnowReport:true})).readings).toEqual([])
    expect(()=>vailSnow('generic error page')).toThrow()
  })
  it('does not call a 12-hour total overnight unless the resort says so',()=>{
    expect(vailSnow(page({...settings,Show12Hr:true,TwelveHrSnowfallLabel:'12 hour'})).readings[0].values.halfDay).toEqual({inches:2})
    expect(vailSnow(page({...settings,Show12Hr:true,TwelveHrSnowfallLabel:'Overnight'})).readings[0].values.overnight).toEqual({inches:2})
  })
  it('rejects a different RCR mountain and never substitutes a neighbouring time interval',()=>{
    const feed={resortName:'Fernie%20Alpine%20Resort',newSnow24:'0',newSnow48:'7',newSnow72:'0',snowPack:'--',saveDate:'Tue%20Nov%2024%202026%2007%3A32%3A36%20GMT-0600'}
    expect(()=>rcrSnow(feed,/Nakiska/,'Base')).toThrow();expect(rcrSnow(feed,/Fernie/,'Base').readings[0].values).toEqual({day:{metric:0},twoDays:{metric:7}})
  })
  it('distinguishes a report of rain and wet snow from a measured rainfall amount',()=>{
    const fixture='<h3>WEATHER&SNOW REPORT</h3><p>2026/11/24 08:22 Update</p><table><tr><th>Area / Item</th><th>Weather</th><th>Snow Depth(cm)</th><th>today’s snowfall(cm)</th><th>Snow Condition</th></tr><tr><th>Usagidaira</th><td>Rain</td><td>166</td><td>0</td><td>Wet Snow</td></tr></table><p>2026/11/25 10:00 Update</p>'
    const [r]=hakubaSnow(fixture).readings
    expect(r.at).toBe('2026-11-23T23:22:00.000Z'); expect(r.sky).toBe('Rain');expect(r.surface).toBe('Wet Snow')
    expect(r.values).toEqual({today:{metric:0},depth:{metric:166}})
    expect(()=>hakubaSnow(fixture.replace('Depth(cm)','Depth(in)'))).toThrow()
  })
  it('matches only the gauge row for today, not storm rainfall, rain rate or an icon',()=>{
    const fixture=(rain:string)=>`Seli National Ski Center. Seli,  0:10,25/11/26 <img title="Today's Rain"><table><tr><td>Storm Total</td><td>60 mm</td></tr><tr><td>Today's Rain<br>Σημερινός Υετός</td><td>${rain}&nbsp;mm</td></tr></table>`
    const [r]=seliRain(fixture('0.0')).readings
    expect(r.at).toBe('2026-11-24T22:10:00.000Z');expect(r.values).toEqual({rainToday:{metric:0}})
    expect(seliRain(fixture('--')).readings).toEqual([]);expect(showAmount('rainToday',{metric:25.4},'imperial')).toBe('1 in')
  })
  it('keeps snow date apart from update time and ignores closed or unlicensed station data',()=>{
    const point={LicenseInfo:{ClosedData:false,License:'CC0'},Active:true,Shortname:'Upper station',LastUpdate:'2026-11-24T08:00:00',LastSnowDate:'2026-11-20T00:00:00',SnowHeight:'41',newSnowHeight:'2'}
    expect(ltsReading(point)).toMatchObject({at:'2026-11-24T07:00:00.000Z',snowDate:'2026-11-20',values:{depth:{metric:41},recent:{metric:2}}})
    expect(ltsReading({...point,Active:false})).toBeNull();expect(ltsReading({...point,LicenseInfo:{ClosedData:true}})).toBeNull()
  })
  it('never treats unknown or old observation times as current, even if just collected',()=>{
    const now=Date.parse('2026-11-24T12:00Z');expect(reportAge(null,now)).toBe('unknown');expect(reportAge('2026-10-10T12:00Z',now)).toBe('older');expect(reportAge('2026-11-24T06:00Z',now)).toBe('recent');expect(zoned('2026-07-24T08:00','Europe/Athens')).toBe('2026-07-24T05:00:00.000Z')
  })
})
