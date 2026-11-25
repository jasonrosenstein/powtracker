// The ranked list: cards on a phone, a sortable table on wide screens. Rows render in pages so a
// phone never lays out two thousand of them at once.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Spark } from '../charts/charts.tsx'
import { CONFIDENCE_LABEL, confidenceOf, distanceKm, LEVEL_INDEX, measuredDepth, measuredFall, METRICS, openingLine, spreadOf, valueOf, type LatLon, type Metric, type Row, type SortKey } from '../lib/data.ts'
import { LEVEL_LABELS, type Level } from '../lib/models.ts'
import { FREE_DAYS, metricNeeds, sortNeeds } from '../lib/plan.ts'
import { snowClass, snowScale, type SnowScale } from '../lib/scale.ts'
import type { PassDef } from '../lib/types.ts'
import { elevUnit, fmtElev, fmtElevNum, fmtSnow, fmtSnowNum, fmtSnowRange, snowUnit, snowUnitName, type Units } from '../lib/units.ts'
import { ConfidenceBars, IconLock, IconStar } from './icons.tsx'
import { usePlan } from './Plan.tsx'

const PAGE = 50

export interface RankingsProps {
  rows: readonly Row[]
  passes: readonly PassDef[]
  units: Units
  dark: boolean
  metric: Metric
  setMetric: (m: Metric) => void
  level: Level
  sort: { key: SortKey; desc: boolean }
  setSort: (s: { key: SortKey; desc: boolean }) => void
  here: LatLon | null
  wide: boolean
  isSaved: (id: string) => boolean
  toggleSaved: (id: string) => void
  onOpen: (id: string) => void
  /** Shown when there are no rows. */
  empty: ReactNode
}

/** The snowfall figure in a filled tile, shaded by how much: the eye finds the storms first. */
export function SnowBadge({ cm, units, scale }: { cm: number | null; units: Units; scale: SnowScale }) {
  const cls = snowClass(cm, scale)
  const style = cls < 0 ? undefined : { background: scale.ramp[cls], color: scale.ink[cls] }
  return (
    <span className={cls < 0 ? 'badge is-none' : 'badge'} style={style}>
      <b className="num">{fmtSnowNum(cm, units)}</b>
      <small>{snowUnit(units)}</small>
    </span>
  )
}

export function SeasonTag({ opening }: { opening: Row['op'] }) {
  const season = openingLine(opening)
  return season ? <span className="tag is-season">{season.short}</span> : null
}

export function SaveButton({ saved, name, onToggle }: { saved: boolean; name: string; onToggle: () => void }) {
  return (
    <button type="button" className="star" aria-pressed={saved} aria-label={saved ? `Remove ${name} from saved` : `Save ${name}`} onClick={(e) => { e.stopPropagation(); onToggle() }}>
      <IconStar filled={saved} size={20} />
    </button>
  )
}

const fmtDistance = (km: number, units: Units) => (units === 'metric' ? `${Math.round(km).toLocaleString('en-US')} km away` : `${Math.round(km / 1.609344).toLocaleString('en-US')} mi away`)

export function Rankings(p: RankingsProps) {
  const { plan } = usePlan()
  // The small bars preview the days ahead: all 14 for Pro, the free plan's 3 otherwise.
  const sparkDays = plan === 'pro' ? 14 : FREE_DAYS
  const [shown, setShown] = useState(PAGE)
  const sentinel = useRef<HTMLDivElement>(null)
  // A new filter or sort starts again from the top of the list.
  useEffect(() => setShown(PAGE), [p.rows])
  const more = p.rows.length > shown
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((entries) => entries[0].isIntersecting && setShown((n) => n + PAGE), { rootMargin: '800px' })
    io.observe(el)
    return () => io.disconnect()
  }, [more])

  if (p.rows.length === 0) return <div className="empty">{p.empty}</div>

  const scale = snowScale(p.dark, p.units)
  const passShort = (slug: string) => p.passes.find((x) => x.slug === slug)?.label.replace(/ Pass$/, '') ?? slug
  const visible = p.rows.slice(0, shown)
  const metricDef = METRICS.find((m) => m.id === p.metric)!
  const li = LEVEL_INDEX[p.level]

  /** The one extra fact under the name: whatever the list is sorted by, else the vertical drop. */
  const fact = (row: Row): { text: string; strong: boolean } => {
    switch (p.sort.key) {
      case 'near':
        return p.here ? { text: fmtDistance(distanceKm(p.here, row.r.la, row.r.lo), p.units), strong: true } : { text: `${fmtElev(row.vert, p.units)} vertical`, strong: false }
      case 'base':
        return { text: `Base ${fmtElev(row.r.b, p.units)}`, strong: true }
      case 'top':
        return { text: `Summit ${fmtElev(row.r.t, p.units)}`, strong: true }
      case 'km':
        return { text: `${row.r.km} km of runs`, strong: true }
      default:
        return { text: `${fmtElev(row.vert, p.units)} vertical`, strong: p.sort.key === 'vert' }
    }
  }
  /** Snow on the ground at the nearest station, where one measures it. */
  const depth = (row: Row): string | null => {
    const d = measuredDepth(row)
    return d ? `${fmtSnow(d.v, p.units)} on the ground` : null
  }
  /** What stands behind the number: model confidence for a forecast, a station reading for the past. */
  const backing = (row: Row): ReactNode => {
    const conf = confidenceOf(row.f, p.metric)
    if (conf) return <><ConfidenceBars level={conf.level} /> {CONFIDENCE_LABEL[conf.level]}</>
    if (!metricDef.past) return row.f ? 'Too few models to rate' : 'No forecast yet'
    const measured = measuredFall(row, p.metric)
    return measured ? <><span className="dot-measured" aria-hidden="true" /> Measured at {measured.st}</> : 'Model estimate'
  }

  return (
    <>
      {p.wide ? (
        <div className="card table-card">
          <WideTable {...p} visible={visible} passShort={passShort} scale={scale} backing={backing} sparkDays={sparkDays} />
        </div>
      ) : (
        <ol className="mcards">
          {visible.map((row, i) => {
            const f = fact(row)
            return (
              <li key={row.r.id} className="mcard">
                <div className="mcard-side">
                  <span className="mrank num">{i + 1}</span>
                  <SaveButton saved={p.isSaved(row.r.id)} name={row.r.n} onToggle={() => p.toggleSaved(row.r.id)} />
                </div>
                <button type="button" className="mcard-main" onClick={() => p.onOpen(row.r.id)}>
                  <span className="mcard-text">
                    <span className="name">{row.r.n}</span>
                    <span className="place">
                      {[row.r.rg, row.r.co].filter(Boolean).join(', ')}
                      {row.r.p.map((slug) => <span key={slug} className="tag">{passShort(slug)}</span>)}
                      <SeasonTag opening={row.op} />
                    </span>
                    <span className="fact num">
                      <span className={f.strong ? 'is-strong' : undefined}>{f.text}</span>
                      {depth(row) && <span className={p.sort.key === 'depth' ? 'is-strong' : undefined}> · {depth(row)}</span>}
                    </span>
                  </span>
                  <SnowBadge cm={valueOf(row, p.metric, p.level)} units={p.units} scale={scale} />
                  <span className="mcard-foot">
                    {row.f && <Spark days={row.f.d[li].slice(0, sparkDays)} />}
                    <span className="backing">{backing(row)}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
      {more && (
        <div className="more" ref={sentinel}>
          <button type="button" className="ghost-btn" onClick={() => setShown((n) => n + PAGE)}>Show more</button>
        </div>
      )}
      <p className="list-note">
        {metricDef.past
          ? <>Snow that has fallen, in {snowUnitName(p.units)}: <span className="dot-measured" aria-hidden="true" /> measured at a snow station within 10 km where there is one, otherwise the weather models' estimate at {LEVEL_LABELS[p.level].toLowerCase()} elevation.</>
          : <>Forecast snowfall at {LEVEL_LABELS[p.level].toLowerCase()} elevation, in {snowUnitName(p.units)}.</>}{' '}
        Snow on the ground is measured at the nearest station. The small bars are the next {sparkDays} days.
      </p>
    </>
  )
}

function WideTable(p: RankingsProps & { visible: Row[]; passShort: (slug: string) => string; scale: SnowScale; backing: (row: Row) => ReactNode; sparkDays: number }) {
  const { plan } = usePlan()
  const sortBy = (key: SortKey, defaultDesc = true) => p.setSort({ key, desc: p.sort.key === key ? !p.sort.desc : defaultDesc })
  const sortBySnow = (metric: Metric) => {
    const same = p.sort.key === 'snow' && p.metric === metric
    // A period the plan does not include: setMetric opens the paywall, and the order stays as it is.
    p.setMetric(metric)
    if (!metricNeeds(plan, metric)) p.setSort({ key: 'snow', desc: same ? !p.sort.desc : true })
  }
  const Th = ({ label, active, onClick, title, locked }: { label: string; active: boolean; onClick: () => void; title?: string; locked?: boolean }) => (
    <th scope="col" aria-sort={active ? (p.sort.desc ? 'descending' : 'ascending') : undefined} title={title}>
      <button type="button" onClick={onClick}>
        {label} {locked ? <IconLock size={12} /> : <span className="arrow" aria-hidden="true">{active ? (p.sort.desc ? '↓' : '↑') : ''}</span>}
      </button>
    </th>
  )
  const li = LEVEL_INDEX[p.level]
  return (
    <div className="table-wrap">
      <table className="rank">
        <thead>
          <tr>
            <th scope="col"><span className="th-plain">#</span></th>
            <Th label="Mountain" active={p.sort.key === 'name'} onClick={() => sortBy('name', false)} />
            <Th label={`Vertical, ${elevUnit(p.units)}`} active={p.sort.key === 'vert'} onClick={() => sortBy('vert')} />
            <Th label="Base" active={p.sort.key === 'base'} onClick={() => sortBy('base')} />
            <Th label="Summit" active={p.sort.key === 'top'} onClick={() => sortBy('top')} />
            <Th label={`Depth, ${snowUnit(p.units)}`} active={p.sort.key === 'depth'} onClick={() => sortBy('depth')} title="Snow on the ground, measured at the nearest station" locked={sortNeeds(plan, 'depth') != null} />
            {METRICS.map((m) => (
              <Th key={m.id} label={m.past ? `Last ${m.short}` : m.short} active={p.sort.key === 'snow' && p.metric === m.id} onClick={() => sortBySnow(m.id)} title={`${m.label}, ${snowUnit(p.units)}`} locked={metricNeeds(plan, m.id) != null} />
            ))}
            <Th label="Confidence" active={p.sort.key === 'agree'} onClick={() => sortBy('agree')} title="How closely the weather models agree on the selected forecast, with the lowest and highest model." locked={sortNeeds(plan, 'agree') != null} />
            <th scope="col"><span className="th-plain">Next {p.sparkDays} days</span></th>
          </tr>
        </thead>
        <tbody>
          {p.visible.map((row, i) => {
            const spread = spreadOf(row.f, p.metric, p.level)
            return (
              <tr key={row.r.id} onClick={() => p.onOpen(row.r.id)}>
                <td className="rank-n num">{i + 1}</td>
                <td>
                  <div className="name-cell">
                    <SaveButton saved={p.isSaved(row.r.id)} name={row.r.n} onToggle={() => p.toggleSaved(row.r.id)} />
                    <div>
                      <button type="button" className="name-btn" onClick={(e) => { e.stopPropagation(); p.onOpen(row.r.id) }}>{row.r.n}</button>
                      <div className="place">
                        {[row.r.rg, row.r.co].filter(Boolean).join(', ')}
                        {row.r.p.map((slug) => <span key={slug} className="tag">{p.passShort(slug)}</span>)}
                        <SeasonTag opening={row.op} />
                      </div>
                    </div>
                  </div>
                </td>
                <td className="num">{fmtElevNum(row.vert, p.units)}</td>
                <td className="num">{fmtElevNum(row.r.b, p.units)}</td>
                <td className="num">{fmtElevNum(row.r.t, p.units)}</td>
                <td className="num">{fmtSnowNum(measuredDepth(row)?.v, p.units)}</td>
                {METRICS.map((m) => {
                  if (metricNeeds(plan, m.id)) return <td key={m.id} className="num is-locked"><IconLock size={12} /></td>
                  const v = valueOf(row, m.id, p.level)
                  const station = measuredFall(row, m.id)
                  return m.id === p.metric ? (
                    <td key={m.id} className="is-key"><SnowBadge cm={v} units={p.units} scale={p.scale} /></td>
                  ) : (
                    <td key={m.id} className="num" title={station ? `Measured at ${station.st}` : undefined}>
                      {station && <span className="dot-measured" aria-label="measured" />}
                      {fmtSnowNum(v, p.units)}
                    </td>
                  )
                })}
                <td className="conf-cell">
                  <span className="backing">{p.backing(row)}</span>
                  {spread && <span className="range num">{fmtSnowRange(spread.lo, spread.hi, p.units)}</span>}
                </td>
                <td className="spark-cell">{row.f && <Spark days={row.f.d[li].slice(0, p.sparkDays)} />}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
