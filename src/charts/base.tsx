// Shared pieces of the detail charts: sizing, the crosshair, the tooltip and time labels.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

/** Width of an element, tracked as it resizes. */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    setWidth(Math.round(el.getBoundingClientRect().width))
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

/**
 * The index under the pointer (or chosen with the arrow keys). Spread `bind` on the focusable
 * chart element so keyboard users get the same readout as hover.
 */
export function useCrosshair(count: number) {
  const [idx, setIdx] = useState<number | null>(null)
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      const step = e.key === 'ArrowLeft' ? -1 : 1
      setIdx((i) => Math.max(0, Math.min(count - 1, (i ?? (step > 0 ? -1 : count)) + step)))
    },
    [count],
  )
  const bind = {
    tabIndex: 0,
    onKeyDown,
    onFocus: () => setIdx((i) => i ?? 0),
    onBlur: () => setIdx(null),
    onPointerLeave: () => setIdx(null),
  }
  return { idx, setIdx, bind }
}

/** A readout pinned beside position `x` (px from the chart's left edge), flipping near the right edge. */
export function Tooltip({ x, width, children }: { x: number; width: number; children: ReactNode }) {
  const right = x > width / 2
  return (
    <div className="tip" style={right ? { right: width - x + 10 } : { left: x + 10 }} role="status">
      {children}
    </div>
  )
}

export function TipRow({ value, label, kind }: { value: string; label: string; kind?: 'accent' | 'muted' }) {
  return (
    <div className="tip-row">
      {kind && <span className={`key key-${kind}`} />}
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Wall-clock parts of a UTC instant at a fixed offset (the resort's local time). */
export function localParts(utcMs: number, offsetSec: number) {
  const d = new Date(utcMs + offsetSec * 1000)
  return { weekday: WEEKDAYS[d.getUTCDay()], day: d.getUTCDate(), month: MONTHS[d.getUTCMonth()], hour: d.getUTCHours() }
}

/** "Tue 17 Nov, 14:00" in the resort's local time. */
export function fmtLocal(utcMs: number, offsetSec: number): string {
  const p = localParts(utcMs, offsetSec)
  return `${p.weekday} ${p.day} ${p.month}, ${String(p.hour).padStart(2, '0')}:00`
}

/** "Tue 17 Nov" from a "YYYY-MM-DD" local date. */
export function fmtDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

export function weekdayOf(date: string): string {
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]
}

/** Indices where a new local day starts, for day gridlines on an hourly axis. */
export function dayBoundaries(times: readonly number[], offsetSec: number): { i: number; label: string }[] {
  const out: { i: number; label: string }[] = []
  times.forEach((t, i) => {
    const p = localParts(t, offsetSec)
    if (p.hour === 0) out.push({ i, label: `${p.weekday} ${p.day}` })
  })
  return out
}

/** Keep every nth label so that labels sit at least `minPx` apart. */
export function thin<T>(items: readonly T[], spacingPx: number, minPx: number): T[] {
  const every = Math.max(1, Math.ceil(minPx / Math.max(spacingPx, 1)))
  return items.filter((_, i) => i % every === 0)
}

export function ChartCard({ title, note, legend, children }: { title: string; note?: string; legend?: ReactNode; children: ReactNode }) {
  return (
    <section className="chart-card">
      <header>
        <h3>{title}</h3>
        {note && <p>{note}</p>}
      </header>
      {legend && <div className="legend">{legend}</div>}
      {children}
    </section>
  )
}
