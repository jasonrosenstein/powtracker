// The resort detail charts. Each answers one question and uses one hue: the consensus is the
// accent, individual models recede to grey, and every value is also in the data table below them.
import { max, min } from 'd3-array'
import { scaleLinear } from 'd3-scale'
import { line as d3line } from 'd3-shape'
import { useId, type PointerEvent } from 'react'
import type { LevelView, Meteogram } from '../lib/live.ts'
import { MODELS } from '../lib/models.ts'
import { tempAt } from '../lib/snow.ts'
import { elevUnit, elevValue, fmtElev, fmtSnow, fmtSnowNum, fmtTemp, snowUnit, snowUnitName, snowValue, type Units } from '../lib/units.ts'
import { ChartCard, dayBoundaries, fmtLocal, thin, TipRow, Tooltip, useCrosshair, useWidth } from './base.tsx'

const lastValue = (s: readonly (number | null)[]): number | null => {
  for (let i = s.length - 1; i >= 0; i--) if (s[i] != null) return s[i]
  return null
}

/** Index nearest the pointer along a plot that runs from `left` over `plotW` px. */
function indexAt(e: PointerEvent<SVGElement>, left: number, plotW: number, count: number): number {
  const box = e.currentTarget.getBoundingClientRect()
  const frac = (e.clientX - box.left - left) / Math.max(plotW, 1)
  return Math.max(0, Math.min(count - 1, Math.round(frac * (count - 1))))
}

// ---------------------------------------------------------------------------------------------

/** Running snowfall total from now: every model as a thin grey line, the consensus on top. */
export function AccumulationChart({ view, offsetSec, units }: { view: LevelView; offsetSec: number; units: Units }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const n = view.times.length
  const { idx, setIdx, bind } = useCrosshair(n)
  const m = { top: 12, right: 52, bottom: 24, left: 34 }
  const height = 230
  const plotW = Math.max(0, width - m.left - m.right)
  const plotH = height - m.top - m.bottom

  const top = max([lastValue(view.cumMean) ?? 0, ...view.cumByModel.map((s) => lastValue(s) ?? 0)]) ?? 0
  const x = scaleLinear([0, n - 1], [m.left, m.left + plotW])
  const y = scaleLinear([0, Math.max(snowValue(top, units), units === 'metric' ? 5 : 2)], [m.top + plotH, m.top]).nice(4)
  const path = d3line<number | null>()
    .defined((v) => v != null)
    .x((_, i) => x(i))
    .y((v) => y(snowValue(v ?? 0, units)))
  const days = dayBoundaries(view.times, offsetSec)
  const dayLabels = thin(days, plotW / Math.max(days.length, 1), 52)
  const end = lastValue(view.cumMean)

  return (
    <ChartCard
      title="Snowfall building up over the next 14 days"
      note="Running total from now. Each grey line is one weather model and stops where that model's forecast ends."
      legend={
        <>
          <span><i className="key key-accent" />Consensus of all models</span>
          <span><i className="key key-muted" />Individual models</span>
        </>
      }
    >
      <div className="chart" ref={ref}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`Cumulative snowfall forecast, reaching ${fmtSnow(end, units)} after 14 days by consensus. Use the arrow keys to read values.`}
            {...bind}
            onPointerMove={(e) => setIdx(indexAt(e, m.left, plotW, n))}
          >
            {y.ticks(4).map((t) => (
              <g key={t}>
                <line className="grid" x1={m.left} x2={m.left + plotW} y1={y(t)} y2={y(t)} />
                <text className="tick" x={m.left - 6} y={y(t)} dy="0.32em" textAnchor="end">{t}</text>
              </g>
            ))}
            {days.map((d) => (
              <line key={d.i} className="grid" x1={x(d.i)} x2={x(d.i)} y1={m.top} y2={m.top + plotH} />
            ))}
            {dayLabels.map((d) => (
              <text key={d.i} className="tick" x={x(d.i) + 3} y={height - 7}>{d.label}</text>
            ))}
            <line className="axis" x1={m.left} x2={m.left + plotW} y1={y(0)} y2={y(0)} />
            {view.cumByModel.map((s, i) => (
              <path key={MODELS[i].id} className="line-muted" d={path(s) ?? undefined} />
            ))}
            <path className="line-accent" d={path(view.cumMean) ?? undefined} />
            {end != null && (
              <>
                <circle className="dot-accent" cx={x(n - 1)} cy={y(snowValue(end, units))} r={4.5} />
                <text className="label" x={x(n - 1) + 9} y={y(snowValue(end, units))} dy="0.32em">{fmtSnowNum(end, units)}</text>
                <text className="tick" x={x(n - 1) + 9} y={y(snowValue(end, units)) + 14}>{snowUnit(units)}</text>
              </>
            )}
            {idx != null && <line className="crosshair" x1={x(idx)} x2={x(idx)} y1={m.top} y2={m.top + plotH} />}
          </svg>
        )}
        {idx != null && (
          <Tooltip x={x(idx)} width={width}>
            <div className="tip-head">{fmtLocal(view.times[idx], offsetSec)}</div>
            <TipRow kind="accent" value={fmtSnow(view.cumMean[idx], units)} label="Consensus" />
            {MODELS.map((model, i) => (
              <TipRow key={model.id} kind="muted" value={view.cumByModel[i][idx] == null ? 'ended' : fmtSnow(view.cumByModel[i][idx], units)} label={model.label} />
            ))}
          </Tooltip>
        )}
      </div>
    </ChartCard>
  )
}

// ---------------------------------------------------------------------------------------------

interface BarRow {
  key: string
  label: string
  sub?: string
  value: number | null
  /** Shown in place of the value when it is null. */
  empty?: string
}

/** Horizontal bars with the label on the left and the value at the tip. */
function BarList({ rows, units, reference, labelW }: { rows: BarRow[]; units: Units; reference?: { value: number; label: string }; labelW: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const rowH = 30
  const m = { top: reference ? 20 : 4, right: 58, bottom: 4, left: labelW }
  const plotW = Math.max(0, width - m.left - m.right)
  const top = Math.max(max(rows, (r) => r.value ?? 0) ?? 0, reference?.value ?? 0)
  const x = scaleLinear([0, Math.max(snowValue(top, units), units === 'metric' ? 5 : 2)], [0, plotW])
  const height = m.top + rows.length * rowH + m.bottom
  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={rows.map((r) => `${r.label}: ${r.value == null ? (r.empty ?? 'no value') : fmtSnow(r.value, units)}`).join('; ')}>
          {rows.map((r, i) => {
            const cy = m.top + i * rowH + rowH / 2
            const w = r.value == null ? 0 : x(snowValue(r.value, units))
            const rad = Math.min(4, w)
            return (
              <g key={r.key}>
                <text className="row-label" x={0} y={cy} dy={r.sub ? '-0.2em' : '0.32em'}>{r.label}</text>
                {r.sub && <text className="tick" x={0} y={cy} dy="1em">{r.sub}</text>}
                {w > 0.5 && (
                  <path className="bar-accent" d={`M${m.left},${cy - 7}H${m.left + w - rad}Q${m.left + w},${cy - 7} ${m.left + w},${cy - 7 + rad}V${cy + 7 - rad}Q${m.left + w},${cy + 7} ${m.left + w - rad},${cy + 7}H${m.left}Z`} />
                )}
                <text className={r.value == null ? 'tick' : 'label'} x={m.left + w + 6} y={cy} dy="0.32em">
                  {r.value == null ? (r.empty ?? '–') : fmtSnowNum(r.value, units)}
                </text>
              </g>
            )
          })}
          <line className="axis" x1={m.left} x2={m.left} y1={m.top} y2={height - m.bottom} />
          {reference && (
            <g>
              <line className="reference" x1={m.left + x(snowValue(reference.value, units))} x2={m.left + x(snowValue(reference.value, units))} y1={m.top - 4} y2={height - m.bottom} />
              <text className="tick" x={m.left + x(snowValue(reference.value, units))} y={10} textAnchor={x(snowValue(reference.value, units)) > plotW * 0.7 ? 'end' : 'start'}>
                {reference.label}
              </text>
            </g>
          )}
        </svg>
      )}
    </div>
  )
}

/** Consensus snowfall for one window at a ladder of elevations, summit first. */
export function ElevationChart({ profile, base, top, windowLabel, units }: { profile: { z: number; mean: number | null }[]; base: number; top: number; windowLabel: string; units: Units }) {
  const rows: BarRow[] = [...profile].reverse().map((p) => ({
    key: String(p.z),
    label: fmtElev(p.z, units),
    sub: p.z === top ? 'Summit' : p.z === base ? 'Base' : undefined,
    value: p.mean,
    empty: 'beyond the models',
  }))
  return (
    <ChartCard
      title={`Snow by elevation, ${windowLabel.toLowerCase()}`}
      note={`Consensus total, in ${snowUnitName(units)}, at each height on the mountain. Where bars shrink toward the base, part of the storm falls as rain there.`}
    >
      <BarList rows={rows} units={units} labelW={76} />
    </ChartCard>
  )
}

/** Each model's own total for one window, against the consensus. */
export function ModelChart({ total, windowLabel, units }: { total: { mean: number | null; byModel: readonly (number | null)[] }; windowLabel: string; units: Units }) {
  const rows: BarRow[] = MODELS.map((model, i) => ({
    key: model.id,
    label: model.label,
    sub: model.kind === 'ai' ? `${model.org}, AI model` : model.org,
    value: total.byModel[i],
    empty: `ends at day ${Math.floor(model.horizonDays)}`,
  }))
  return (
    <ChartCard
      title={`Model by model, ${windowLabel.toLowerCase()}`}
      note={`Each model's own total, in ${snowUnitName(units)}. The closer the bars, the more the forecast can be trusted.`}
    >
      <BarList rows={rows} units={units} labelW={128} reference={total.mean == null ? undefined : { value: total.mean, label: `Consensus ${fmtSnow(total.mean, units)}` }} />
    </ChartCard>
  )
}

// ---------------------------------------------------------------------------------------------

/**
 * Where rain turns to snow, against the mountain: the snow line through time over a band from
 * base to summit, with precipitation in its own panel underneath on the same time axis.
 */
export function SnowLineChart({ met, base, top, offsetSec, units }: { met: Meteogram; base: number; top: number; offsetSec: number; units: Units }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const clipId = useId()
  const n = met.times.length
  const { idx, setIdx, bind } = useCrosshair(n)
  const m = { top: 10, right: 12, bottom: 24, left: 44 }
  const lineH = 190
  const gap = 18
  const precipH = 56
  const height = m.top + lineH + gap + precipH + m.bottom
  const plotW = Math.max(0, width - m.left - m.right)
  // The axis holds the mountain and as much of the snow line's travel as is useful: down to sea
  // level, and up to 2,500 m above the summit. Beyond that the line runs along the edge.
  const pad = Math.max(300, (top - base) * 0.35)
  const seen = met.snowLine.filter((v): v is number => v != null)
  const zLo = Math.max(0, Math.min(base - pad, (min(seen) ?? base) - 150))
  const zHi = Math.max(top + pad, Math.min((max(seen) ?? top) + 150, top + 2500))
  const x = scaleLinear([0, n - 1], [m.left, m.left + plotW])
  const y = scaleLinear([elevValue(zLo, units), elevValue(zHi, units)], [m.top + lineH, m.top])
  const yz = (z: number) => y(elevValue(Math.max(zLo, Math.min(zHi, z)), units))
  const path = d3line<number | null>()
    .defined((v) => v != null)
    .x((_, i) => x(i))
    .y((v) => yz(v ?? 0))

  // Precipitation in 3-hour sums: 112 thin columns instead of 336 hairs.
  const bins: { i: number; mm: number }[] = []
  for (let i = 0; i < n; i += 3) bins.push({ i, mm: (met.precip[i] ?? 0) + (met.precip[i + 1] ?? 0) + (met.precip[i + 2] ?? 0) })
  const pTop = m.top + lineH + gap
  const py = scaleLinear([0, Math.max(max(bins, (b) => b.mm) ?? 0, 2)], [pTop + precipH, pTop]).nice(2)
  const binW = Math.max(1, (plotW / bins.length) * 0.7)
  const days = dayBoundaries(met.times, offsetSec)
  const dayLabels = thin(days, plotW / Math.max(days.length, 1), 52)

  const at = idx == null ? null : met.snowLine[idx]
  const verdict = at == null ? '' : at <= base ? 'Snow down to the base' : at >= top ? 'Rain up to the summit' : `Snow above ${fmtElev(at, units)}, rain below`
  const tRef = idx == null ? null : met.tempRef[idx]

  return (
    <ChartCard
      title="Snow line and precipitation"
      note={`The line is the height, in ${elevUnit(units) === 'm' ? 'metres' : 'feet'}, where rain turns to snow (consensus of all models). When it runs under the shaded mountain band it snows to the base; over it, it rains to the summit.`}
    >
      <div className="chart" ref={ref}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label="Snow line elevation and precipitation for the next 14 days. Use the arrow keys to read values."
            {...bind}
            onPointerMove={(e) => setIdx(indexAt(e, m.left, plotW, n))}
          >
            <defs>
              <clipPath id={clipId}><rect x={m.left} y={m.top} width={plotW} height={lineH} /></clipPath>
            </defs>
            <rect className="band" x={m.left} width={plotW} y={yz(top)} height={yz(base) - yz(top)} />
            {days.map((d) => (
              <line key={d.i} className="grid" x1={x(d.i)} x2={x(d.i)} y1={m.top} y2={pTop + precipH} />
            ))}
            {y.ticks(4).map((t) => (
              <g key={t}>
                <line className="grid" x1={m.left} x2={m.left + plotW} y1={y(t)} y2={y(t)} />
                <text className="tick" x={m.left - 6} y={y(t)} dy="0.32em" textAnchor="end">{t.toLocaleString('en-US')}</text>
              </g>
            ))}
            {[{ z: top, label: 'Summit', dy: '-0.45em' }, { z: base, label: 'Base', dy: '1.15em' }].map((ref) => (
              <g key={ref.label}>
                <line className="axis" x1={m.left} x2={m.left + plotW} y1={yz(ref.z)} y2={yz(ref.z)} />
                <text className="tick ref-label" x={m.left + plotW - 4} y={yz(ref.z)} dy={ref.dy} textAnchor="end">{ref.label} {fmtElev(ref.z, units)}</text>
              </g>
            ))}
            <path className="line-accent" clipPath={`url(#${clipId})`} d={path(met.snowLine) ?? undefined} />
            <text className="tick" x={m.left} y={pTop - 5}>Precipitation, mm per 3 hours</text>
            {py.ticks(2).filter((t) => t > 0).map((t) => (
              <g key={t}>
                <line className="grid" x1={m.left} x2={m.left + plotW} y1={py(t)} y2={py(t)} />
                <text className="tick" x={m.left - 6} y={py(t)} dy="0.32em" textAnchor="end">{t}</text>
              </g>
            ))}
            {bins.map((b) => b.mm > 0.05 && <rect key={b.i} className="bar-accent" x={x(b.i + 1) - binW / 2} width={binW} y={py(b.mm)} height={py(0) - py(b.mm)} />)}
            <line className="axis" x1={m.left} x2={m.left + plotW} y1={py(0)} y2={py(0)} />
            {dayLabels.map((d) => (
              <text key={d.i} className="tick" x={x(d.i) + 3} y={height - 7}>{d.label}</text>
            ))}
            {idx != null && <line className="crosshair" x1={x(idx)} x2={x(idx)} y1={m.top} y2={pTop + precipH} />}
          </svg>
        )}
        {idx != null && (
          <Tooltip x={x(idx)} width={width}>
            <div className="tip-head">{fmtLocal(met.times[idx], offsetSec)}</div>
            <TipRow kind="accent" value={at == null ? '–' : fmtElev(Math.max(0, at), units)} label="Snow line" />
            <div className="tip-note">{verdict}</div>
            <TipRow value={`${(met.precip[idx] ?? 0).toFixed(1)} mm/h`} label="Precipitation" />
            <TipRow value={fmtTemp(tRef == null ? null : tempAt(tRef, met.zRef, top), units)} label="Summit" />
            <TipRow value={fmtTemp(tRef == null ? null : tempAt(tRef, met.zRef, base), units)} label="Base" />
          </Tooltip>
        )}
      </div>
    </ChartCard>
  )
}

// ---------------------------------------------------------------------------------------------

/** Fourteen tiny columns: the shape of the next two weeks at a glance. Decorative; values are in the detail. */
export function Spark({ days, capCm = 40 }: { days: readonly (number | null)[]; capCm?: number }) {
  const w = 5
  const gap = 2
  const h = 24
  return (
    <svg className="spark" width={days.length * (w + gap) - gap} height={h} aria-hidden="true">
      {days.map((v, i) => {
        const bh = v == null || v < 0.5 ? 0 : Math.max(2, (Math.min(v, capCm) / capCm) * h)
        return bh === 0 ? (
          <rect key={i} className="spark-zero" x={i * (w + gap)} y={h - 1} width={w} height={1} />
        ) : (
          <rect key={i} className="spark-bar" x={i * (w + gap)} y={h - bh} width={w} height={bh} rx={1} />
        )
      })}
    </svg>
  )
}
