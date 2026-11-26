// Two aligned miniature charts; compare depths across days within a row, never add rain to snow.
import { useState } from 'react'
import { IconLock } from '../components/icons.tsx'
import type { DailyWind, WindDays } from '../lib/daily-wind.ts'
import type { DayTotal } from '../lib/live.ts'
import { compass } from '../lib/mountain-weather.ts'
import { fmtRainNum, fmtSnow, fmtSnowNum, fmtSnowRange, fmtTemp, fmtWind, rainUnit, snowUnit, tempValue, type Units } from '../lib/units.ts'
import { fmtDate, weekdayOf } from './base.tsx'

function Depth({kind, amount, top, text}: {kind: 'snow' | 'rain'; amount: number | null; top: number; text: string}) {
  const visible = amount != null && amount > 0 && text !== '0'
  return <span className={`depth-row ${kind}`}>
    <span className="bar-box"><span className="bar" style={{height: visible ? `max(2px, ${100 * amount / top}%)` : 0}} /></span>
    <span className={`amt num${visible ? '' : ' is-zero'}`}>{text}</span>
  </span>
}

function windText(w: DailyWind | undefined, units: Units) {
  if (!w) return 'unavailable'
  if (w.kmh === 0) return 'calm'
  return `${fmtWind(w.kmh, units)}${w.fromDegrees == null ? ' (direction unavailable)' : ` from ${compass(w.fromDegrees)}`}`
}

export function DayStrip({ days, wind, units, levelLabel, openDays = days.length, onLocked }: {
  days: DayTotal[]
  wind: WindDays | null
  units: Units
  levelLabel: string
  openDays?: number
  onLocked?: () => void
}) {
  const [picked, setPicked] = useState<string | null>(null)
  const open = days.slice(0, openDays)
  if (!open.length) return null
  const snowTop = Math.max(5, ...open.map(d => d.mean ?? 0))
  const rainTop = Math.max(5, ...open.map(d => d.rainMm ?? 0))
  // Start on the first visible date, not a storm a week off the edge of a phone.
  const d = open.find(day => day.date === picked) ?? open[0]
  const hasTemps = open.some(x => x.tLo != null)
  const deg = (c: number | null) => c == null ? '–' : `${Math.round(tempValue(c, units))}°`
  const rain = (mm: number | null) => mm == null ? 'unavailable' : `${fmtRainNum(mm, units)} ${rainUnit(units)}`

  return <section className="chart-card" aria-label="Day by day forecast">
    <header><h3>Day by day</h3>
      <p>Snow and rain at {levelLabel}. Compare bars within each row. Wind is the strongest hourly forecast at mid-mountain, not a gust.</p>
    </header>
    <div className="daily-grid">
      <div className="daily-key" aria-hidden="true">
        <span className="date-row">Day</span>
        <span className="depth-row"><b><i className="snow-key" />Snow</b><small>{snowUnit(units)}</small></span>
        <span className="depth-row"><b><i className="rain-key" />Rain</b><small>{rainUnit(units)}</small></span>
        <span className="wind-row"><b>Wind</b><small>from</small></span>
        {hasTemps && <span className="temps">Hi / Lo</span>}
      </div>
      <div className="daystrip" role="listbox" aria-label="Forecast days">
        {days.map((day, i) => {
          const weekend = [0, 6].includes(new Date(`${day.date}T00:00:00Z`).getUTCDay())
          const date = fmtDate(day.date), locked = i >= openDays
          const w = wind?.[day.date]
          const label = locked ? `${date}: part of Pro` : `${date}: snow ${fmtSnow(day.mean, units)}, rain ${rain(day.rainMm)}, peak wind ${windText(w, units)}${hasTemps ? `, high ${fmtTemp(day.tHi, units)}, low ${fmtTemp(day.tLo, units)}` : ''}`
          return <button key={day.date} type="button" role="option" aria-label={label} title={label} aria-selected={!locked && day === d}
            className={`day${weekend ? ' is-weekend' : ''}${locked ? ' is-locked' : ''}`} onClick={() => locked ? onLocked?.() : setPicked(day.date)}>
            <span className="date-row"><span className="dow">{weekdayOf(day.date)}</span><span className="dom num">{Number(day.date.slice(8))}</span></span>
            {locked ? <span className="locked-day"><IconLock size={15} /> Pro</span> : <>
              <Depth kind="snow" amount={day.mean} top={snowTop} text={fmtSnowNum(day.mean, units)} />
              <Depth kind="rain" amount={day.rainMm} top={rainTop} text={fmtRainNum(day.rainMm, units)} />
              <span className="wind-row num"><b>{w?.kmh === 0 ? 'Calm' : fmtWind(w?.kmh ?? null, units)}</b>
                <small>{w?.fromDegrees != null ? compass(w.fromDegrees) : '–'}</small></span>
              {hasTemps && <span className="temps num">{deg(day.tHi)} / {deg(day.tLo)}</span>}
            </>}
          </button>
        })}
      </div>
    </div>
    <div className="day-detail" aria-live="polite">
      <b>{fmtDate(d.date)}</b>
      <span>Snow <strong className="num">{fmtSnow(d.mean, units)}</strong>{d.lo != null && d.hi != null && <> (model range {fmtSnowRange(d.lo, d.hi, units)})</>}</span>
      <span>Rain <strong className="num">{rain(d.rainMm)}</strong></span>
      <span>Peak wind <strong className="num">{windText(wind?.[d.date], units)}</strong></span>
      {d.tLo != null && <span>{fmtTemp(d.tLo, units)} to {fmtTemp(d.tHi, units)}</span>}
    </div>
    <p className="daily-hint">Swipe for more days · Tap for details · – means unavailable
      {open.length < days.length && <> · Later days are part of Pro</>}</p>
    <details className="data"><summary>Daily forecast table</summary>
      <div className="table-wrap"><table className="data num">
        <thead><tr><th scope="col">Day</th><th scope="col">Snow ({snowUnit(units)})</th><th scope="col">Rain ({rainUnit(units)})</th><th scope="col">Peak wind</th></tr></thead>
        <tbody>{open.map(day => <tr key={day.date}><th scope="row">{fmtDate(day.date)}</th><td>{fmtSnowNum(day.mean, units)}</td><td>{fmtRainNum(day.rainMm, units)}</td><td>{windText(wind?.[day.date], units)}</td></tr>)}</tbody>
      </table></div>
    </details>
  </section>
}
