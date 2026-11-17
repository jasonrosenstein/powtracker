// The day-by-day forecast: fourteen columns to swipe through, each with its snowfall as a bar and
// a figure, and the day's temperature range. Tapping a day opens its detail underneath, which is
// how a phone reads what a mouse would get from hovering.
import { max } from 'd3-array'
import { useState } from 'react'
import type { DayTotal } from '../lib/live.ts'
import { fmtSnow, fmtSnowNum, fmtSnowRange, fmtTemp, snowUnitName, tempValue, type Units } from '../lib/units.ts'
import { fmtDate, weekdayOf } from './base.tsx'

const BAR_H = 64

export function DayStrip({ days, units, levelLabel }: { days: DayTotal[]; units: Units; levelLabel: string }) {
  const peak = days.reduce((best, d, i) => ((d.mean ?? 0) > (days[best].mean ?? 0) ? i : best), 0)
  const [picked, setPicked] = useState<number | null>(null)
  const sel = picked ?? ((days[peak].mean ?? 0) >= 0.5 ? peak : 0)
  const top = Math.max(max(days, (d) => d.mean ?? 0) ?? 0, 5)
  const d = days[sel]
  const hasTemps = days.some((x) => x.tLo != null)
  const deg = (c: number | null) => (c == null ? '–' : `${Math.round(tempValue(c, units))}°`)

  return (
    <section className="chart-card">
      <header>
        <h3>Day by day</h3>
        <p>Snowfall each day, in {snowUnitName(units)}{hasTemps ? ', over the day\'s warmest and coldest hour' : ''}. Tap a day for more.</p>
      </header>
      <div className="daystrip" role="listbox" aria-label="Forecast days">
        {days.map((day, i) => {
          const cm = day.mean ?? 0
          const h = cm < 0.5 ? 0 : Math.max(3, (cm / top) * BAR_H)
          const weekend = [0, 6].includes(new Date(`${day.date}T00:00:00Z`).getUTCDay())
          return (
            <button key={day.date} type="button" role="option" aria-selected={i === sel} className={weekend ? 'day is-weekend' : 'day'} onClick={() => setPicked(i)}>
              <span className="dow">{i === 0 ? 'Today' : weekdayOf(day.date)}</span>
              <span className="dom num">{Number(day.date.slice(8))}</span>
              <span className="bar-box" style={{ height: BAR_H }}>
                <span className="bar" style={{ height: h }} />
              </span>
              <span className={cm >= 0.5 ? 'amt num' : 'amt num is-zero'}>{fmtSnowNum(day.mean, units)}</span>
              {hasTemps && <span className="temps num">{deg(day.tHi)} <i>{deg(day.tLo)}</i></span>}
            </button>
          )
        })}
      </div>
      <div className="day-detail" aria-live="polite">
        <b>{fmtDate(d.date)}</b>
        <span><strong className="num">{fmtSnow(d.mean, units)}</strong> of snow at {levelLabel}</span>
        {d.lo != null && d.hi != null && <span>Models say {fmtSnowRange(d.lo, d.hi, units)}</span>}
        {d.tLo != null && <span>{fmtTemp(d.tLo, units)} to {fmtTemp(d.tHi, units)}</span>}
      </div>
    </section>
  )
}
