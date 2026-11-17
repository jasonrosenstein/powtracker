// One mountain in depth, as a full screen on a phone and a side panel on a wide screen: the
// totals for each window, the day-by-day forecast, then charts drawn from the live output of
// every model, fetched when the panel opens.
import { useEffect, useMemo, useRef, useState } from 'react'
import { fmtDate } from '../charts/base.tsx'
import { AccumulationChart, ElevationChart, ModelChart, SnowLineChart } from '../charts/charts.tsx'
import { DayStrip } from '../charts/DayStrip.tsx'
import { biggestStorm, CONFIDENCE_LABEL, LEVEL_INDEX, rateSpread, type Metric, type Row } from '../lib/data.ts'
import { fmtAgo } from '../lib/hooks.ts'
import { elevationProfile, fetchLive, levelView, meteogram, snapshotDays, type DayTotal, type Live } from '../lib/live.ts'
import { LEVEL_LABELS, LEVELS, MODELS, WINDOW_LABELS, WINDOWS_H, type Level } from '../lib/models.ts'
import { modelSpread } from '../lib/snow.ts'
import type { Observation, PassDef } from '../lib/types.ts'
import { fmtElev, fmtSnow, fmtSnowNum, fmtSnowRange, snowUnit, type Units } from '../lib/units.ts'
import { Segmented } from './Controls.tsx'
import { ConfidenceBars, IconBack, IconShare } from './icons.tsx'
import { SaveButton } from './Rankings.tsx'

const WINDOW_OF: Partial<Record<Metric, number>> = { w3: 0, w7: 1, w14: 2 }

const OBS_LABEL: Record<Observation['k'], string> = {
  depth: 'Snow on the ground',
  new24: 'New snow in 24 hours',
  change24: 'Deeper than 24 hours ago',
  new72: 'New snow in 72 hours',
  change72: 'Deeper than 72 hours ago',
}

type LiveState = { status: 'loading' } | { status: 'ready'; live: Live } | { status: 'error'; message: string }

/** The forecast in one sentence: the storm a skier would plan around. */
function stormLine(days: readonly DayTotal[], units: Units): string {
  const storm = biggestStorm(days)
  if (!storm) return 'No meaningful snow in the next 14 days.'
  if (storm.from === storm.to) return `Biggest day: ${fmtDate(storm.from)}, with ${fmtSnow(storm.totalCm, units)}.`
  return `Main storm ${fmtDate(storm.from)} to ${fmtDate(storm.to)}: ${fmtSnow(storm.totalCm, units)}, heaviest on ${fmtDate(storm.peak.date)} (${fmtSnow(storm.peak.cm, units)}).`
}

export function Detail({ row, obs, passes, units, metric, level: initialLevel, generated, saved, onToggleSaved, onClose }: {
  row: Row
  /** Station measurements near this resort, when a source covers it. */
  obs: readonly Observation[] | undefined
  passes: readonly PassDef[]
  units: Units
  metric: Metric
  level: Level
  generated: Date
  saved: boolean
  onToggleSaved: () => void
  onClose: () => void
}) {
  const { r, f } = row
  const [level, setLevel] = useState<Level>(initialLevel)
  const [win, setWin] = useState(WINDOW_OF[metric] ?? 1)
  const [state, setState] = useState<LiveState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctl = new AbortController()
    setState({ status: 'loading' })
    fetchLive(r, ctl.signal)
      .then((live) => setState({ status: 'ready', live }))
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setState({ status: 'error', message: e instanceof Error ? e.message : String(e) })
      })
    return () => ctl.abort()
  }, [r, attempt])

  // Modal behaviour: Escape closes, the page behind does not scroll, focus starts in the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  // Share this mountain's link: the share sheet on a touch device, the clipboard with a mouse
  // (where "copy link" is what people expect and a system share sheet is a detour).
  const [shared, setShared] = useState('')
  const share = async () => {
    const link = { title: `${r.n} snow forecast`, url: location.href }
    try {
      if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
        await navigator.share(link)
        return
      }
      await navigator.clipboard.writeText(link.url)
      setShared('Link copied')
    } catch (e) {
      // Closing the share sheet is not an error worth a message.
      if ((e as Error).name !== 'AbortError') setShared('Copy the address from the browser bar to share it')
    }
    setTimeout(() => setShared(''), 2500)
  }

  const elevOf = (l: Level) => (l === 'base' ? r.b : l === 'top' ? r.t : Math.round((r.b + r.t) / 2))
  const z = elevOf(level)
  const li = LEVEL_INDEX[level]
  const live = state.status === 'ready' ? state.live : null
  const view = useMemo(() => (live ? levelView(live, z) : null), [live, z])
  const met = useMemo(() => (live ? meteogram(live) : null), [live])
  const profile = useMemo(() => {
    if (!live) return null
    const steps = 6
    const ladder = Array.from({ length: steps + 1 }, (_, k) => (k === 0 ? r.b : k === steps ? r.t : Math.round((r.b + ((r.t - r.b) * k) / steps) / 10) * 10))
    return elevationProfile(live, ladder, WINDOWS_H[win])
  }, [live, win, r])

  // Totals come from the live fetch once it lands, and from the snapshot until then.
  const totals = WINDOWS_H.map((_, wi) => {
    const t = view
      ? { mean: view.totals[wi].mean, lo: view.totals[wi].lo, hi: view.totals[wi].hi, n: view.totals[wi].n, byModel: view.totals[wi].byModel }
      : { mean: f?.w[li][wi] ?? null, lo: f?.lo[li][wi] ?? null, hi: f?.hi[li][wi] ?? null, n: f?.n[wi] ?? 0, byModel: (f?.mm ?? []).map((m) => m[wi]) }
    // Without live data the per-model totals are for mid elevation; rate them against the mid consensus.
    return { ...t, conf: rateSpread(modelSpread(t.byModel, view ? t.mean : (f?.w[1][wi] ?? null)), wi === 2) }
  })
  const past = view ? view.past : [f?.p[li][0] ?? null, f?.p[li][1] ?? null]
  const days = view ? view.days : f ? snapshotDays(f.d0, f.d[li]) : null
  const offsetSec = live?.h.utcOffsetSeconds ?? 0
  const levelLabel = `${LEVEL_LABELS[level].toLowerCase()} elevation`
  const windowLabel = `Next ${WINDOW_LABELS[win]}`

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="detail" role="dialog" aria-modal="true" aria-label={`${r.n} snow forecast`} tabIndex={-1} ref={panel}>
        <div className="detail-bar">
          <button type="button" className="icon-btn is-round" aria-label="Back to the list" onClick={onClose}><IconBack /></button>
          <h2>{r.n}</h2>
          <button type="button" className="star" aria-label={`Share the ${r.n} forecast`} onClick={share}><IconShare /></button>
          <SaveButton saved={saved} name={r.n} onToggle={onToggleSaved} />
        </div>
        {shared && <p className="toast" role="status">{shared}</p>}

        <div className="detail-body">
          <p className="detail-sub">
            {[r.rg, r.co].filter(Boolean).join(', ')}
            {r.p.map((slug) => <span key={slug} className="tag">{passes.find((x) => x.slug === slug)?.label ?? slug}</span>)}
            {r.w && <a href={r.w} target="_blank" rel="noreferrer">Resort site</a>}
          </p>

          <div className="hero" role="group" aria-label="Forecast period">
            {totals.map((t, wi) => (
              <button key={wi} type="button" className="hero-tile" aria-pressed={wi === win} onClick={() => setWin(wi)}>
                <span className="t-label">Next {WINDOW_LABELS[wi]}</span>
                <span className="t-value num">{fmtSnowNum(t.mean, units)}<small>{snowUnit(units)}</small></span>
                {t.conf ? (
                  <span className="t-conf"><ConfidenceBars level={t.conf.level} /> {CONFIDENCE_LABEL[t.conf.level].replace(' confidence', '')}</span>
                ) : (
                  <span className="t-conf">{t.n === 0 ? 'Beyond the models' : 'Few models'}</span>
                )}
                {t.n > 1 && <span className="t-range num">{fmtSnowRange(t.lo, t.hi, units)}</span>}
              </button>
            ))}
          </div>
          {days && <p className="storyline">{stormLine(days, units)}</p>}

          <Segmented
            label="Elevation on the mountain"
            options={LEVELS.map((l) => ({ id: l, label: LEVEL_LABELS[l], sub: fmtElev(elevOf(l), units) }))}
            value={level}
            onChange={setLevel}
            grow
          />

          {days && <DayStrip days={days} units={units} levelLabel={levelLabel} />}

          <section className="chart-card recent">
            <header>
              <h3>On the ground now</h3>
              <p>{obs && obs.length > 0 ? 'Measured at snow stations near the mountain.' : 'No snow station reports within 10 km at this mountain\'s height, so these are the weather models\' estimates.'}</p>
            </header>
            {obs && obs.length > 0 && (
              <ul className="measured">
                {obs.map((o) => (
                  <li key={o.k}>
                    <strong className="num">{fmtSnow(o.v, units)}</strong>
                    <span><b>{OBS_LABEL[o.k]}</b> at {o.st} ({fmtElev(o.z, units)}, {o.km} km away), {fmtAgo(new Date(o.at))}. {o.src}.</span>
                  </li>
                ))}
              </ul>
            )}
            <div className={obs && obs.length > 0 ? 'recent-row is-secondary' : 'recent-row'}>
              <div><strong className="num">{fmtSnow(past[0], units)}</strong><span>last 24 hours, model estimate</span></div>
              <div><strong className="num">{fmtSnow(past[1], units)}</strong><span>last 72 hours, model estimate</span></div>
            </div>
          </section>

          {state.status === 'loading' && <p className="status">Loading the latest run of every model for the charts…</p>}
          {state.status === 'error' && (
            <p className="status is-error">
              Live model data is not available right now: {state.message.replace(/\.$/, '')}. Everything here is from the snapshot taken {fmtAgo(generated)}.{' '}
              <button type="button" className="link-btn" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
            </p>
          )}

          {live && view && met && profile ? (
            <>
              <AccumulationChart view={view} offsetSec={offsetSec} units={units} />
              <ElevationChart profile={profile} base={r.b} top={r.t} windowLabel={windowLabel} units={units} />
              <ModelChart total={view.totals[win]} windowLabel={windowLabel} units={units} />
              <SnowLineChart met={met} base={r.b} top={r.t} offsetSec={offsetSec} units={units} />
            </>
          ) : (
            state.status === 'error' && f && (
              <>
                <ElevationChart profile={[r.b, elevOf('mid'), r.t].map((elev, i) => ({ z: elev, mean: f.w[i][win] }))} base={r.b} top={r.t} windowLabel={windowLabel} units={units} />
                <ModelChart total={{ mean: f.w[1][win], byModel: f.mm.map((m) => m[win]) }} windowLabel={`${windowLabel} at mid elevation`} units={units} />
              </>
            )
          )}

          <section className="chart-card">
            <header><h3>The mountain</h3></header>
            <dl className="facts num">
              <div><dt>Base</dt><dd>{fmtElev(r.b, units)}</dd></div>
              <div><dt>Summit</dt><dd>{fmtElev(r.t, units)}</dd></div>
              <div><dt>Vertical</dt><dd>{fmtElev(r.t - r.b, units)}</dd></div>
              {r.km > 0 && <div><dt>Runs</dt><dd>{r.km} km</dd></div>}
              {r.li > 0 && <div><dt>Lifts</dt><dd>{r.li}</dd></div>}
            </dl>
          </section>

          {live && view && (
            <>
              <p className="status">Charts use live model data fetched {fmtAgo(new Date(live.fetchedMs))}. Times are local to the mountain.</p>
              <details className="data">
                <summary>Data table: daily snowfall by model at {levelLabel}</summary>
                <div className="table-wrap">
                  <table className="data num">
                    <thead>
                      <tr>
                        <th scope="col">Day</th>
                        <th scope="col">Consensus, {snowUnit(units)}</th>
                        {MODELS.map((m) => <th key={m.id} scope="col">{m.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {view.days.map((d) => (
                        <tr key={d.date}>
                          <td>{fmtDate(d.date)}</td>
                          <td><b>{fmtSnowNum(d.mean, units)}</b></td>
                          {d.byModel.map((v, i) => <td key={MODELS[i].id}>{fmtSnowNum(v, units)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
