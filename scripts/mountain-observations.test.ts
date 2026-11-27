import { expect, it } from 'vitest'
import { franceNivo } from './lib/france-nivo.ts'
import { observatoryRain } from './lib/report-parsers.ts'
import { snotelReading } from './lib/snotel.ts'

it('reads validated SNOTEL snow depth in inches and compares exact station-local hours', () => {
  const site = {stationTriplet:'541:CA:SNTL',networkCode:'SNTL',name:'Independence Lake',latitude:39.4,longitude:-120.3,elevation:8340,dataTimeZone:-8}
  const stationElement = {elementCode:'SNWD',ordinal:1,storedUnitCode:'in',durationName:'HOURLY'}
  const values = [{date:'2026-11-23 16:00',value:null,qcFlag:'V'}, {date:'2026-11-25 16:00',value:20,qcFlag:'V'},
    {date:'2026-11-26 16:00',value:29,qcFlag:'V'}, {date:'2026-11-26 17:00',value:99,qcFlag:'S'}]
  const parse = (element = stationElement, at = '2026-11-27T02:00:00Z') => snotelReading(site,{stationTriplet:site.stationTriplet,data:[{stationElement:element,values}]}, Date.parse(at))
  const s = parse()!; expect(s.depthCm.at).toBe('2026-11-27T00:00:00.000Z'); expect(s.depthCm.value).toBeCloseTo(73.66); expect(s.elevation).toBeCloseTo(2542.032)
  expect(s.change24Cm?.value).toBeCloseTo(22.86); expect(s.change72Cm).toBeUndefined(); expect(s).not.toHaveProperty('new24Cm')
  expect(parse({...stationElement,elementCode:'WTEQ'})).toBeNull(); expect(parse(stationElement,'2026-12-01T12:00:00Z')).toBeNull()
})

it('uses the newest valid measured ground depth, not file date, snowfall, or total precip', () => {
  const row = (id: string, at: string, depth: string) => `${id};Test_NIVO;45.5;6.5;2100;${at};${depth};20;0.2;-99`
  const csv = ['geo_id_wigos;name;lat;lon;Altitude;validity_time;ht_neige;rr24;ssfrai;perssfrai',
    row('A','2026-11-25T08:00:00Z','0.52'), row('A','2026-11-24T07:00:00Z','0.40'), row('A','2026-11-26T06:45:00Z',''),
    row('B','2026-11-20T07:00:00Z','0.3'), row('C','2026-11-26T09:00:00Z','4'), row('D','2026-11-25T07:00:00Z','-99'),
    row('E','2026-11-25T07:00:00Z','0')].join('\n')
  const stations = franceNivo(csv, Date.parse('2026-11-26T07:00:00Z'), 72)
  expect(stations.map(s=>s.depthCm.value)).toEqual([52,0]); expect(stations[0].depthCm.at).toBe('2026-11-25T08:00:00.000Z')
  expect(stations[0]).not.toHaveProperty('new24Cm'); expect(()=>franceNivo('bad csv',0,72)).toThrow()
})

it('reads only the identified ski-center daily gauge, preserving its Athens clock and missing data', () => {
  const page = (value: string) => `Weather station of Vasilitsa Provided by the National Observatory of Athens Elevation: 1780 m
    Latest Values / Τελευταίες Τιμές 27/11/2026 02:30
    <span>Today's Rain</span><br><span>Σημερινός Υετός</span></div><div class="lright"><span>${value}</span></div>
    <span>Storm Total</span><br><span>Other</span></div><div class="lright"><span>92 mm</span></div>`
  const parse = (html: string) => observatoryRain(html,'Vasilitsa',1780)
  expect(parse(page('16.8 mm')).readings[0]).toMatchObject({values:{rainToday:{metric:16.8}},at:'2026-11-27T00:30:00.000Z',zone:'Europe/Athens'})
  expect(parse(page('0 mm')).readings[0].values.rainToday).toEqual({metric:0})
  expect(parse(page('--- mm')).readings).toEqual([]); expect(parse(page('1 mm')+' The station appears to be offline').readings).toEqual([])
  expect(()=>parse(page('2 mm/h'))).toThrow(); expect(()=>observatoryRain(page('1 mm'),'Other station',1780)).toThrow()
})
