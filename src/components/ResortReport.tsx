import type { Async } from '../lib/hooks.ts'
import { reportAge, reportLabels, showAmount, type PublishedReport, type Reading, type ReportFile, type ReportMetric } from '../lib/reports.ts'
import type { Units } from '../lib/units.ts'

const dateLabel = (at: string, timeZone?: string) => new Date(at).toLocaleString(undefined,{timeZone,year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'})
const keys = Object.keys(reportLabels) as ReportMetric[]
function timeLabel({at,zone}: Reading) {
  if (!at || reportAge(at)==='unknown') return 'Report time not confirmed'
  return `${reportAge(at)==='older' ? 'Older report' : 'Reported'} · ${dateLabel(at,zone)}`
}
function fields(r:Reading) {return keys.filter(k=>r.values[k]!==undefined)}
function label(k: ReportMetric,r: Reading) {return k==='recent' && r.snowDate ? `New snow · ${r.snowDate} (period not stated)` : reportLabels[k]}

export function PublishedReadings({items,units}:{items:PublishedReport[];units:Units}) {
  const operator=items.some(x=>x.kind==='operator')
  const rows=items.flatMap(report=>report.readings.map(reading=>({report,reading}))).filter(x=>fields(x.reading).length)
    .sort((a,b)=> (a.report.kind===b.report.kind ? 0 : a.report.kind==='operator' ? -1 : 1) || (Date.parse(b.reading.at??'')||0)-(Date.parse(a.reading.at??'')||0))
  if (!rows.length) return <p className="status">No resort-reported snow total in this update.</p>
  const {reading,report}=rows[0], first=fields(reading)[0], rain=rows.some(x=>x.reading.values.rainToday)
  return <section className="chart-card recent" aria-label="Published mountain report">
    <header><h3>{operator ? 'Resort snow report' : 'Local station report'}</h3><p>{timeLabel(reading)}</p></header>
    <ul className="measured"><li><strong className="num">{showAmount(first,reading.values[first]!,units)}</strong><span><b>{label(first,reading)}</b> · {reading.place}</span></li></ul>
    {(reading.sky || reading.surface || report.surface) && <p>{[reading.sky && `Reported weather: ${reading.sky}`, (reading.surface || report.surface) && `Surface: ${reading.surface || report.surface}`].filter(Boolean).join(' · ')}</p>}
    <p className="hint">{!operator && 'No operator snow total in this update. '}{!rain ? (reading.sky && /rain|drizzle/i.test(reading.sky) ? 'Rain reported; amount not given.' : 'Rainfall not reported.') : 'Gauge amount, not a mountain-wide rain total.'}</p>
    <p className="hint"><a href={report.url} target="_blank" rel="noreferrer">{report.source}</a> · Last collected {dateLabel(report.checked)}</p>
    {(rows.length>1 || fields(reading).length>1) && <details className="data"><summary>All published totals and measuring sites</summary>
      {rows.map(({report:r,reading:obs},i)=><div key={`${r.url}-${i}`}>
        <p><b>{obs.place}</b> · {timeLabel(obs)}</p>
        <dl className="facts num">{fields(obs).map(k=><div key={k}><dt>{label(k,obs)}</dt><dd>{showAmount(k,obs.values[k]!,units)}</dd></div>)}</dl>
        {r.url !== report.url && <p className="hint"><a href={r.url} target="_blank" rel="noreferrer">{r.source}</a></p>}
      </div>)}
    </details>}
  </section>
}
export function ResortReport({id,units,data}:{id:string;units:Units;data:Async<ReportFile>}) {
  if (data.status==='loading') return <p className="status">Loading published mountain reports…</p>
  if (data.status==='error') return <p className="status">The mountain reports could not be loaded. Forecasts below are separate.</p>
  return <PublishedReadings items={data.data.resorts[id]??[]} units={units}/>
}
