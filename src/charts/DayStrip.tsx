// The day-by-day forecast: fourteen columns to swipe through, each with its snowfall as a bar and
// a figure, and the day's temperature range. Tapping a day opens its detail underneath, which is
// how a phone reads what a mouse would get from hovering.
import { max } from 'd3-array'
import { useState } from 'react'
import { IconLock } from '../components/icons.tsx'
import type { DayTotal } from '../lib/live.ts'
import { fmtSnow, fmtSnowNum, fmtSnowRange, fmtTemp, snowUnitName, tempValue, type Units } from '../lib/units.ts'
import { fmtDate, weekdayOf } from './base.tsx'

const BAR_H = 64

export function DayStrip({ days, units, levelLabel, openDays = days.length, onLocked }: {
  days: DayTotal[]
  units: Units
  levelLabel: string
  /** How many days, from today, the plan shows. The rest are drawn as locked columns. */
  openDays?: number
  /** A locked day was tapped. */
  onLocked?: () => void
}) {
  const open = days.slice(0, openDays)
  const peak = open.reduce((best, d, i) => ((d.mean ?? 0) > (open[best].mean ?? 0) ? i : best), 0)
  const [picked, setPicked] = useState<number | null>(null)
  const sel = Math.min(picked ?? ((open[peak].mean ?? 0) >= 0.5 ? peak : 0), open.length - 1)
  const top = Math.max(max(open, (d) => d.mean ?? 0) ?? 0, 5)
  const d = open[sel]
  const hasTemps = open.some((x) => x.tLo != null)
  const deg = (c: number | null) => (c == null ? '–' : `${Math.round(tempValue(c, units))}°`)
  const locked = days.length - open.length

  return (
    <section className="chart-card">
      <header>
        <h3>Day by day</h3>
        <p>
          Snowfall each day, in {snowUnitName(units)}{hasTemps ? ', over the day\'s warmest and coldest hour' : ''}. Tap a day for more.
          {locked > 0 && <> The next {locked} days are part of Pro.</>}
        </p>
      </header>
      <div className="daystrip" role="listbox" aria-label="Forecast days">
        {days.map((day, i) => {
          const weekend = [0, 6].includes(new Date(`${day.date}T00:00:00Z`).getUTCDay())
          if (i >= openDays) {
            return (
              <button key={day.date} type="button" role="option" aria-selected={false} aria-label={`${fmtDate(day.date)}: part of Pro`} className={weekend ? 'day is-weekend is-locked' : 'day is-locked'} onClick={onLocked}>
                <span className="dow">{weekdayOf(day.date)}</span>
                <span className="dom num">{Number(day.date.slice(8))}</span>
                <span className="bar-box" style={{ height: BAR_H }}><IconLock size={15} /></span>
                <span className="amt num is-zero">Pro</span>
                {hasTemps && <span className="temps num">&nbsp;</span>}
              </button>
            )
          }
          const cm = day.mean ?? 0
          const h = cm < 0.5 ? 0 : Math.max(3, (cm / top) * BAR_H)
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
