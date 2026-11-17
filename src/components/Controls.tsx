// Everything that scopes the rankings and the map: the snowfall period, the elevation, and the
// filters. On a wide screen they sit inline above the table; on a phone the period stays pinned
// and the rest fold into one row of chips that open a sheet.
import { useEffect, useRef, type ReactNode } from 'react'
import { METRICS, NO_FILTERS, SORTS, type Filters, type Metric, type Row, type SortKey } from '../lib/data.ts'
import { LEVEL_LABELS, LEVELS, type Level } from '../lib/models.ts'
import { REGIONS, type Region } from '../lib/regions.ts'
import type { PassDef } from '../lib/types.ts'
import { fmtElev, type Units } from '../lib/units.ts'
import { IconChevron, IconClose } from './icons.tsx'

export function Segmented<T extends string>({ label, options, value, onChange, grow }: {
  label: string
  options: readonly { id: T; label: ReactNode; sub?: string }[]
  value: T
  onChange: (v: T) => void
  /** Stretch the options to share the full width. */
  grow?: boolean
}) {
  return (
    <div className={grow ? 'seg is-grow' : 'seg'} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={o.id === value} onClick={() => onChange(o.id)}>
          {o.label}
          {o.sub && <small>{o.sub}</small>}
        </button>
      ))}
    </div>
  )
}

/** The headline control: which snowfall the whole app is showing. */
export function PeriodBar({ metric, setMetric }: { metric: Metric; setMetric: (m: Metric) => void }) {
  const opts = (past: boolean) => METRICS.filter((m) => m.past === past).map((m) => ({ id: m.id, label: m.short }))
  return (
    <div className="period">
      <div className="period-group">
        <span className="cap">Fallen</span>
        <Segmented label="Snow that has fallen" options={opts(true)} value={metric} onChange={setMetric} grow />
      </div>
      <div className="period-group is-main">
        <span className="cap">Forecast</span>
        <Segmented label="Forecast snowfall" options={opts(false)} value={metric} onChange={setMetric} grow />
      </div>
    </div>
  )
}

export const VERT_STEPS = [0, 500, 1000, 1500]
export const UNIT_OPTIONS: { id: Units; label: string }[] = [
  { id: 'imperial', label: 'Inches, feet' },
  { id: 'metric', label: 'Centimetres, metres' },
]

export interface ControlState {
  rows: readonly Row[]
  passes: readonly PassDef[]
  units: Units
  setUnits: (u: Units) => void
  level: Level
  setLevel: (l: Level) => void
  filters: Filters
  setFilters: (f: Filters) => void
  sort: { key: SortKey; desc: boolean }
  setSort: (s: { key: SortKey; desc: boolean }) => void
}

const shortPass = (label: string) => label.replace(/ Pass$/, '')
const pickSort = (p: ControlState, key: SortKey) => p.setSort({ key, desc: SORTS.find((s) => s.id === key)!.defaultDesc })
const passCount = (p: ControlState, slug: string) => p.rows.filter((row) => row.r.p.includes(slug)).length
const togglePass = (p: ControlState, slug: string) => {
  const on = p.filters.passes.includes(slug)
  p.setFilters({ ...p.filters, passes: on ? p.filters.passes.filter((s) => s !== slug) : [...p.filters.passes, slug] })
}
const regionsIn = (rows: readonly Row[]) => REGIONS.filter((region) => rows.some((row) => row.region === region))
const sizeLabel = (v: number, units: Units) => (v === 0 ? 'Any size' : `${fmtElev(v, units)}+ vertical`)

/** Wide screens: every control visible at once. */
export function Controls(p: ControlState) {
  return (
    <section className="controls" aria-label="Filters">
      <div className="control-row">
        <div className="control">
          <span className="cap">Elevation</span>
          <Segmented label="Elevation on the mountain" options={LEVELS.map((l) => ({ id: l, label: LEVEL_LABELS[l] }))} value={p.level} onChange={p.setLevel} />
        </div>
        <div className="control">
          <label className="cap" htmlFor="f-region">Region</label>
          <select id="f-region" value={p.filters.region} onChange={(e) => p.setFilters({ ...p.filters, region: e.target.value as Region | '' })}>
            <option value="">Worldwide</option>
            {regionsIn(p.rows).map((region) => <option key={region} value={region}>{region}</option>)}
          </select>
        </div>
        <div className="control">
          <label className="cap" htmlFor="f-vert">Mountain size</label>
          <select id="f-vert" value={p.filters.minVert} onChange={(e) => p.setFilters({ ...p.filters, minVert: Number(e.target.value) })}>
            {VERT_STEPS.map((v) => <option key={v} value={v}>{sizeLabel(v, p.units)}</option>)}
          </select>
        </div>
        <div className="control">
          <label className="cap" htmlFor="f-sort">Sort by</label>
          <select id="f-sort" value={p.sort.key} onChange={(e) => pickSort(p, e.target.value as SortKey)}>
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div className="control">
          <span className="cap">Units</span>
          <Segmented label="Units" options={[{ id: 'imperial', label: 'in / ft' }, { id: 'metric', label: 'cm / m' }]} value={p.units} onChange={p.setUnits} />
        </div>
      </div>
      {p.passes.length > 0 && (
        <div className="control">
          <span className="cap">Season pass</span>
          <div className="chips" role="group" aria-label="Season pass">
            <button type="button" className="chip" aria-pressed={p.filters.passes.length === 0} onClick={() => p.setFilters({ ...p.filters, passes: [] })}>All mountains</button>
            {p.passes.map((pass) => (
              <button key={pass.slug} type="button" className="chip" aria-pressed={p.filters.passes.includes(pass.slug)} onClick={() => togglePass(p, pass.slug)}>
                {pass.label} <span className="count">{passCount(p, pass.slug)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

export type SheetSection = 'level' | 'pass' | 'region' | 'size' | 'sort' | 'units'

/** Phones: one row of chips, each naming its current choice and opening the sheet at its section. */
export function FilterChips(p: ControlState & { onOpen: (section: SheetSection) => void }) {
  const picked = p.passes.filter((pass) => p.filters.passes.includes(pass.slug))
  const passText = picked.length === 0 ? 'Any pass' : picked.length === 1 ? shortPass(picked[0].label) : `${shortPass(picked[0].label)} +${picked.length - 1}`
  const chips: { section: SheetSection; text: string; on: boolean }[] = [
    { section: 'pass', text: passText, on: picked.length > 0 },
    { section: 'region', text: p.filters.region || 'Worldwide', on: p.filters.region !== '' },
    { section: 'level', text: `${LEVEL_LABELS[p.level]} elevation`, on: p.level !== 'mid' },
    { section: 'sort', text: SORTS.find((s) => s.id === p.sort.key)!.label, on: p.sort.key !== 'snow' },
    { section: 'size', text: sizeLabel(p.filters.minVert, p.units), on: p.filters.minVert > 0 },
  ]
  return (
    <div className="chiprow" role="group" aria-label="Filters">
      {chips.map((c) => (
        <button key={c.section} type="button" className={c.on ? 'fchip is-on' : 'fchip'} onClick={() => p.onOpen(c.section)}>
          {c.text} <IconChevron />
        </button>
      ))}
    </div>
  )
}

/** The sheet behind the chips: every filter as large, labelled choices. */
export function FilterSheet(p: ControlState & { section: SheetSection; onClose: () => void; count: number }) {
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    body.current?.querySelector(`[data-section="${p.section}"]`)?.scrollIntoView({ block: 'start' })
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && p.onClose()
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
    // The sheet opens once per mount: later section changes do not happen.
  }, [])

  const Choice = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) => (
    <button type="button" className="choice" aria-pressed={on} onClick={onClick}>{children}</button>
  )
  const changed = p.filters.passes.length > 0 || p.filters.region !== '' || p.filters.minVert > 0 || p.level !== 'mid' || p.sort.key !== 'snow'
  const reset = () => {
    p.setFilters({ ...NO_FILTERS, query: p.filters.query })
    p.setLevel('mid')
    p.setSort({ key: 'snow', desc: true })
  }

  return (
    <div className="scrim is-sheet" onClick={(e) => e.target === e.currentTarget && p.onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Filters">
        <div className="sheet-head">
          <h2>Filters</h2>
          {changed && <button type="button" className="link-btn" onClick={reset}>Reset</button>}
          <button type="button" className="icon-btn is-round" aria-label="Close filters" onClick={p.onClose}><IconClose /></button>
        </div>
        <div className="sheet-body" ref={body}>
          {p.passes.length > 0 && (
            <section data-section="pass">
              <h3>Season pass</h3>
              <p className="hint">Pick one or more to see only the mountains they cover.</p>
              <div className="choices">
                <Choice on={p.filters.passes.length === 0} onClick={() => p.setFilters({ ...p.filters, passes: [] })}>Any pass</Choice>
                {p.passes.map((pass) => (
                  <Choice key={pass.slug} on={p.filters.passes.includes(pass.slug)} onClick={() => togglePass(p, pass.slug)}>
                    {shortPass(pass.label)} <span className="count">{passCount(p, pass.slug)}</span>
                  </Choice>
                ))}
              </div>
            </section>
          )}
          <section data-section="region">
            <h3>Region</h3>
            <div className="choices">
              <Choice on={p.filters.region === ''} onClick={() => p.setFilters({ ...p.filters, region: '' })}>Worldwide</Choice>
              {regionsIn(p.rows).map((region) => (
                <Choice key={region} on={p.filters.region === region} onClick={() => p.setFilters({ ...p.filters, region })}>{region}</Choice>
              ))}
            </div>
          </section>
          <section data-section="level">
            <h3>Elevation</h3>
            <p className="hint">Snowfall is worked out separately for the base, the middle and the summit.</p>
            <Segmented label="Elevation on the mountain" options={LEVELS.map((l) => ({ id: l, label: LEVEL_LABELS[l] }))} value={p.level} onChange={p.setLevel} grow />
          </section>
          <section data-section="sort">
            <h3>Sort by</h3>
            <div className="choices">
              {SORTS.map((s) => <Choice key={s.id} on={p.sort.key === s.id} onClick={() => pickSort(p, s.id)}>{s.label}</Choice>)}
            </div>
            <label className="check">
              <input type="checkbox" checked={p.sort.desc !== SORTS.find((s) => s.id === p.sort.key)!.defaultDesc} onChange={() => p.setSort({ ...p.sort, desc: !p.sort.desc })} />
              Reverse the order
            </label>
          </section>
          <section data-section="size">
            <h3>Mountain size</h3>
            <div className="choices">
              {VERT_STEPS.map((v) => <Choice key={v} on={p.filters.minVert === v} onClick={() => p.setFilters({ ...p.filters, minVert: v })}>{sizeLabel(v, p.units)}</Choice>)}
            </div>
          </section>
          <section data-section="units">
            <h3>Units</h3>
            <Segmented label="Units" options={UNIT_OPTIONS} value={p.units} onChange={p.setUnits} grow />
          </section>
        </div>
        <div className="sheet-foot">
          <button type="button" className="primary-btn" onClick={p.onClose}>Show {p.count.toLocaleString('en-US')} mountains</button>
        </div>
      </div>
    </div>
  )
}
