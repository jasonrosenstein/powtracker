// The "Mountain" side of a resort: what a skier needs on the day. Whether it is open and when
// it opens, the trail map, the weather at the summit, every lift and trail, avalanche danger
// beyond the ropes, and how to get there. Live lift and trail status appears where the resort
// publishes it.
import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { fetchAvalancheDanger, hasAvalancheService } from '../lib/avalanche.ts'
import { openingLine, type Row } from '../lib/data.ts'
import { fmtAgo, useAsync } from '../lib/hooks.ts'
import { fetchMountainWeather, SKY_WORDS, windAdvice } from '../lib/mountain-weather.ts'
import { fetchData } from '../lib/origin.ts'
import { fetchLiveStatus, liveFeedFor, tally, type LiveStatus, type LiveTrail, type OpenState } from '../lib/status.ts'
import { decodeTrails, difficultyClasses, liftKey, liftTypeName, nameKey, runLabel, type Trails } from '../lib/trails.ts'
import type { TrailsFile } from '../lib/types.ts'
import { fmtDistance, fmtElev, fmtSnow, fmtTemp, fmtWind, type Units } from '../lib/units.ts'
import { DifficultyMark, IconLock, SkyIcon } from './icons.tsx'
import { usePlan } from './Plan.tsx'

const TrailMap = lazy(() => import('./TrailMap.tsx'))

const STATE_WORD: Record<OpenState, string> = { open: 'Open', closed: 'Closed', hold: 'On hold', scheduled: 'In preparation', unknown: 'Not reported' }
/** The resorts' own ratings, easiest first, with the colour each is signed in. */
const RATINGS: [string, string][] = [
  ['Green', '#2f9e52'],
  ['Blue', '#2a78d6'],
  ['Blue-black', '#2a78d6'],
  ['Red', '#d6403a'],
  ['Black', '#15181e'],
  ['Double black', '#15181e'],
  ['Extreme', '#e07b1a'],
  ['Ski route', '#e07b1a'],
  ['Park', '#8792a3'],
  ['Unrated', '#8792a3'],
]
/** North American signs pair each rating with a shape; elsewhere a rating is a coloured disc. */
const NA_SHAPE: Record<string, string> = { Blue: 'square', 'Blue-black': 'diamond', Black: 'diamond', 'Double black': 'double', Extreme: 'diamond', Park: 'square' }

function State({ state, text }: { state: OpenState; text?: string }) {
  return <span className={`state is-${state}`}><i aria-hidden="true" />{text ?? STATE_WORD[state]}</span>
}

const clock = (hour: number) => (hour === 0 ? '12 AM' : hour === 12 ? '12 PM' : hour < 12 ? `${hour} AM` : `${hour - 12} PM`)

export function Mountain({ row, units, dark }: { row: Row; units: Units; dark: boolean }) {
  const { r } = row
  const { plan, ask } = usePlan()
  const classes = difficultyClasses(r)
  const feed = liveFeedFor(r)
  const feedKey = feed ? (feed.provider === 'mtnpowder' ? `m${feed.id}` : `i${feed.slug}`) : ''
  const [openOnly, setOpenOnly] = useState(false)

  const trails = useAsync<Trails | null>(
    async (signal) => {
      const res = await fetchData(`trails/${r.id}.json`, { signal })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`trail data: HTTP ${res.status}`)
      return decodeTrails((await res.json()) as TrailsFile, r)
    },
    [r.id],
  )
  const live = useAsync<LiveStatus | null>((signal) => (feed ? fetchLiveStatus(feed, signal) : Promise.resolve(null)), [feedKey])
  const weather = useAsync((signal) => fetchMountainWeather(r, signal), [r.id])
  const danger = useAsync((signal) => (hasAvalancheService(r) ? fetchAvalancheDanger(r, signal) : Promise.resolve(null)), [r.id])

  const map = trails.status === 'ready' ? trails.data : null
  const status = live.status === 'ready' ? live.data : null
  const opening = openingLine(row.op)

  // The resort's status for each mapped run and lift: by sign number where both sides have one
  // (how European resorts name runs), otherwise by a name both sources would agree on.
  const matched = useMemo(() => {
    if (!status || !map) return null
    const byNumber = new Map<string, LiveTrail | null>()
    const byName = new Map<string, LiveTrail>()
    for (const t of status.trails) {
      // A number used for two runs with different states cannot be trusted to identify either.
      if (t.number) byNumber.set(t.number, byNumber.has(t.number) && byNumber.get(t.number)?.state !== t.state ? null : t)
      const key = nameKey(t.name)
      // A name used twice (upper and lower sections) counts as open if either is.
      if (key && (!byName.has(key) || t.state === 'open')) byName.set(key, t)
    }
    const liftByName = new Map(status.lifts.map((l) => [liftKey(l.name), l]))
    const runs = map.runs.map((run) => (run.ref && byNumber.get(run.ref)) || (run.name ? byName.get(nameKey(run.name)) : undefined))
    const lifts = map.lifts.map((lift) => (lift.name && liftKey(lift.name) ? liftByName.get(liftKey(lift.name)) : undefined))
    const identifiable = map.runs.filter((run) => run.name || run.ref).length
    // Colouring the map by status is only honest when most of its runs were found in the report.
    return { runs, lifts, usable: identifiable > 0 && runs.filter(Boolean).length / identifiable >= 0.4 }
  }, [status, map])
  const runState = useCallback((i: number) => matched?.runs[i]?.state, [matched])
  const liftState = useCallback((i: number) => matched?.lifts[i]?.state, [matched])
  const runNote = useCallback((i: number) => { const t = matched?.runs[i]; return t ? `${t.statusText}${t.groomed ? ', groomed' : ''} (resort report)` : '' }, [matched])
  const liftNote = useCallback((i: number) => { const l = matched?.lifts[i]; return l ? `${l.statusText}${l.hours ? `, ${l.hours}` : ''} (resort report)` : '' }, [matched])
  const mapLive = matched?.usable === true

  // Kilometres of mapped run in each difficulty class, and the named runs within it.
  const byClass = useMemo(() => {
    if (!map) return []
    return classes
      .map((cls, ci) => {
        const runs = map.runs.filter((run) => run.cls === ci && !run.area)
        const named = new Map<string, { name: string; lengthM: number; verticalM: number }>()
        for (const run of runs) {
          const label = runLabel(run)
          if (!label) continue
          const seen = named.get(label)
          // Maps often split one run into sections: add them up under its name.
          if (seen) {
            seen.lengthM += run.lengthM
            seen.verticalM = Math.max(seen.verticalM, run.verticalM)
          } else named.set(label, { name: label, lengthM: run.lengthM, verticalM: run.verticalM })
        }
        return { cls, km: runs.reduce((m, run) => m + run.lengthM, 0) / 1000, named: [...named.values()].sort((a, b) => b.lengthM - a.lengthM) }
      })
      .filter((c) => c.km > 0)
  }, [map, classes])
  const totalKm = byClass.reduce((m, c) => m + c.km, 0)

  const now = weather.status === 'ready' ? weather.data.hours[0] : null
  const peakGust = weather.status === 'ready' ? Math.max(0, ...weather.data.hours.slice(0, 12).map((h) => h.gust)) : 0
  const advice = windAdvice(peakGust)
  const lifts = status ? tally(status.lifts) : null
  const trailTally = status ? tally(status.trails) : null
  const shownTrails = (list: LiveTrail[]) => (openOnly ? list.filter((t) => t.state === 'open') : list)
  const groomed = status ? status.trails.filter((t) => t.groomed).length : 0

  return (
    <>
      {/* Is it open, and if not, when? --------------------------------------------------------- */}
      {feed && live.status === 'loading' && <p className="status">Checking the resort's live status…</p>}
      {feed && live.status === 'error' && <p className="status is-error">The resort's live status could not be read just now ({live.message}).</p>}
      {status && lifts && trailTally && (
        <section className="chart-card live">
          <header>
            <h3>{status.operating === 'Open' ? 'Open today' : status.operating === 'Closed' ? 'Closed today' : status.operating}</h3>
            <p>Reported by the resort, {status.updated ? `updated ${fmtAgo(status.updated)}` : 'read just now'}.</p>
          </header>
          <div className="live-tiles">
            <div><strong className="num">{lifts.open}<small> of {lifts.total}</small></strong><span>lifts open</span></div>
            <div><strong className="num">{trailTally.open}<small> of {trailTally.total}</small></strong><span>trails open</span></div>
            {groomed > 0 && <div><strong className="num">{groomed}</strong><span>groomed</span></div>}
          </div>
          {opening && status.operating !== 'Open' && <p className="notice"><b>{opening.text}</b> {opening.detail} <a href={opening.source} target="_blank" rel="noreferrer">Source</a></p>}
          {status.alert && <p className="notice">{status.alert}</p>}
          {status.snow && (
            <dl className="facts num">
              <div><dt>Base depth</dt><dd>{fmtSnow(status.snow.baseCm, units)}</dd></div>
              <div><dt>Last 24 hours</dt><dd>{fmtSnow(status.snow.last24Cm, units)}</dd></div>
              <div><dt>Last 72 hours</dt><dd>{fmtSnow(status.snow.last72Cm, units)}</dd></div>
              <div><dt>Last 7 days</dt><dd>{fmtSnow(status.snow.last7dCm, units)}</dd></div>
              <div><dt>This season</dt><dd>{fmtSnow(status.snow.seasonCm, units)}</dd></div>
            </dl>
          )}
          {status.snow && <p className="hint">The resort's own snow report{status.snow.at ? `, taken at ${status.snow.at}` : ''}.</p>}
        </section>
      )}
      {!feed && (
        <section className="chart-card live">
          <header>
            <h3>{opening ? opening.text : 'Open or closed today?'}</h3>
            <p>
              {opening && <>{opening.detail} <a href={opening.source} target="_blank" rel="noreferrer">Source</a>. </>}
              This resort shows which lifts and trails are running only on its own site.
            </p>
          </header>
          {r.w && <div className="links"><a className="ghost-btn" href={r.w} target="_blank" rel="noreferrer">Today's lifts and trails on the resort's site</a></div>}
        </section>
      )}

      {/* Trail map --------------------------------------------------------------------------- */}
      <section className="chart-card trail-card">
        <header>
          <h3>Trail map</h3>
          <p>
            {map ? `${fmtDistance(totalKm * 1000, units)} of runs and ${map.lifts.length} lifts, as mapped in OpenStreetMap. Tap a run or lift for its length and drop.` : 'Runs and lifts as mapped in OpenStreetMap.'}
            {mapLive ? ' Colour means the resort reports it open today; everything else is grey.' : status ? ' Open and closed status is in the lists below.' : ''}
          </p>
        </header>
        {trails.status === 'loading' && <p className="status">Loading the trail map…</p>}
        {trails.status === 'error' && <p className="status is-error">The trail map could not be loaded ({trails.message}).</p>}
        {trails.status === 'ready' && !map && <p className="status">No runs or lifts are mapped for this mountain yet.</p>}
        {map && (
          <>
            <Suspense fallback={<div className="trailmap"><div className="map-loading">Loading the trail map…</div></div>}>
              <TrailMap trails={map} classes={classes} runState={mapLive ? runState : undefined} liftState={mapLive ? liftState : undefined} runNote={runNote} liftNote={liftNote} units={units} dark={dark} />
            </Suspense>
            <div className="legend">
              {byClass.map(({ cls }) => <span key={cls.id}><DifficultyMark color={cls.color} shape={cls.shape} />{cls.label}</span>)}
              <span><i className="key key-lift" />Lift</span>
              {mapLive && <span><i className="key key-closed" />Closed, or not in the resort's report</span>}
            </div>
            {totalKm > 0 && (
              <div className="mix" role="img" aria-label={`Runs by difficulty: ${byClass.map((c) => `${c.cls.label} ${Math.round((c.km / totalKm) * 100)} percent`).join(', ')}`}>
                {byClass.map(({ cls, km }) => (
                  <span key={cls.id} style={{ flexGrow: km, background: cls.color }}>{km / totalKm >= 0.12 ? `${Math.round((km / totalKm) * 100)}%` : ''}</span>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* Weather on the hill ------------------------------------------------------------------ */}
      <section className="chart-card">
        <header>
          <h3>On the mountain</h3>
          <p>Weather at the summit for the next day and a half. Times are local to the mountain.</p>
        </header>
        {weather.status === 'loading' && <p className="status">Loading the mountain weather…</p>}
        {weather.status === 'error' && <p className="status is-error">The mountain weather could not be loaded: {weather.message.replace(/\.$/, '')}.</p>}
        {weather.status === 'ready' && now && (
          <>
            <div className="wx-now">
              <SkyIcon sky={now.sky} night={!now.isDay} size={44} />
              <div>
                <strong className="num">{fmtTemp(now.tempTop, units)}</strong>
                <span>{SKY_WORDS[now.sky]} at the summit, feels like {fmtTemp(now.feelsTop, units)}</span>
              </div>
            </div>
            <dl className="facts num">
              <div><dt>Base</dt><dd>{fmtTemp(now.tempBase, units)}</dd></div>
              <div><dt>Wind</dt><dd>{fmtWind(now.wind, units)} {now.from}</dd></div>
              <div><dt>Gusts</dt><dd>{fmtWind(now.gust, units)}</dd></div>
              {now.visibility != null && <div><dt>Visibility</dt><dd>{now.visibility >= 20_000 ? 'Clear' : fmtDistance(now.visibility, units)}</dd></div>}
              <div><dt>Sunrise</dt><dd>{weather.data.sunrise}</dd></div>
              <div><dt>Sunset</dt><dd>{weather.data.sunset}</dd></div>
            </dl>
            {advice.level > 0 && <p className="notice is-warn">{advice.text} Peak gust in the next 12 hours: {fmtWind(peakGust, units)}.</p>}
            {plan === 'free' ? (
              <button type="button" className="ghost-btn locked-row" onClick={() => ask('hours')}><IconLock size={15} /> The next 36 hours at the summit, hour by hour, with Pro</button>
            ) : (
              <>
                <div className="hourstrip">
                  {weather.data.hours.filter((_, i) => i % 3 === 0).slice(0, 13).map((h, i) => (
                    <div key={h.time} className={h.isDay ? 'hour' : 'hour is-night'}>
                      <span className="dow">{i === 0 ? 'Now' : clock(h.hour)}</span>
                      <SkyIcon sky={h.sky} night={!h.isDay} size={22} />
                      <span className="amt num">{fmtTemp(h.tempTop, units).replace(/[CF]$/, '')}</span>
                      <span className="temps num">{fmtWind(h.gust, units).replace(/ .*/, '')}</span>
                    </div>
                  ))}
                </div>
                <p className="hint">Each column: sky, summit temperature, and gusts in {units === 'metric' ? 'km/h' : 'mph'}.</p>
              </>
            )}
          </>
        )}
      </section>

      {/* Lifts ------------------------------------------------------------------------------- */}
      {(status || map) && (
        <section className="chart-card">
          <header>
            <h3>Lifts</h3>
            <p>{status && lifts ? `${lifts.open} of ${lifts.total} open, as the resort reports.` : 'Every lift mapped on the mountain.'}</p>
          </header>
          <ul className="rows">
            {status
              ? status.lifts.map((l, i) => (
                  <li key={i}>
                    <div><b>{l.name}</b><span>{[l.type, l.hours, l.wait && `wait ${l.wait}`].filter(Boolean).join(' · ')}</span></div>
                    <State state={l.state} text={l.statusText} />
                  </li>
                ))
              : map!.lifts.map((l, i) => (
                  <li key={i}>
                    <div><b>{l.name || liftTypeName(l.type)}</b><span>{liftTypeName(l.type)}</span></div>
                    <span className="num muted">{fmtElev(l.verticalM, units)} rise</span>
                  </li>
                ))}
          </ul>
        </section>
      )}

      {/* Trails ------------------------------------------------------------------------------ */}
      {status && trailTally && status.trails.length > 0 ? (
        <section className="chart-card">
          <header>
            <h3>Trails</h3>
            <p>{trailTally.open} of {trailTally.total} open, as the resort reports.</p>
          </header>
          <label className="check"><input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> Show open trails only</label>
          {RATINGS.filter(([rating]) => status.trails.some((t) => t.rating === rating)).map(([rating, color]) => {
            const all = status.trails.filter((t) => t.rating === rating)
            return (
              <details key={rating} className="group" open={openOnly}>
                <summary><DifficultyMark color={color} shape={r.rc === 'n' ? (NA_SHAPE[rating] ?? 'circle') : rating === 'Ski route' ? 'diamond' : 'circle'} /><b>{rating}</b><span className="num">{all.filter((t) => t.state === 'open').length} of {all.length} open</span></summary>
                <ul className="rows">
                  {shownTrails(all).map((t, i) => (
                    <li key={i}>
                      <div><b>{[t.number, t.name].filter(Boolean).join(' ')}</b><span>{[t.area, t.groomed && 'groomed'].filter(Boolean).join(' · ')}</span></div>
                      <State state={t.state} text={t.statusText} />
                    </li>
                  ))}
                  {shownTrails(all).length === 0 && <li className="muted">None open.</li>}
                </ul>
              </details>
            )
          })}
        </section>
      ) : (
        map && byClass.length > 0 && (
          <section className="chart-card">
            <header>
              <h3>Trails</h3>
              <p>Named runs by difficulty, longest first.</p>
            </header>
            {byClass.map(({ cls, km, named }) => (
              <details key={cls.id} className="group">
                <summary><DifficultyMark color={cls.color} shape={cls.shape} /><b>{cls.label}</b><span className="num">{named.length} named · {fmtDistance(km * 1000, units)}</span></summary>
                <ul className="rows">
                  {named.map((run) => (
                    <li key={run.name}>
                      <div><b>{run.name}</b></div>
                      <span className="num muted">{fmtDistance(run.lengthM, units)} · {fmtElev(run.verticalM, units)} drop</span>
                    </li>
                  ))}
                  {named.length === 0 && <li className="muted">No named runs mapped.</li>}
                </ul>
              </details>
            ))}
          </section>
        )
      )}

      {/* Avalanche danger --------------------------------------------------------------------- */}
      {hasAvalancheService(r) && danger.status === 'ready' && danger.data && (
        <section className="chart-card">
          <header>
            <h3>Avalanche danger outside the ski area</h3>
            <p>{danger.data.center}{danger.data.zone ? `, ${danger.data.zone}` : ''}. Inside the boundary, ski patrol manages the hazard.</p>
          </header>
          <div className={`danger is-l${danger.data.level}`}>
            <strong className="num">{danger.data.level || '–'}</strong>
            <span><b>{danger.data.label}</b>{danger.data.level ? ' (on a scale of 1 to 5)' : ''}</span>
          </div>
          {danger.data.advice && <p className="hint">{danger.data.advice}</p>}
          <a className="ghost-btn" href={danger.data.link} target="_blank" rel="noreferrer">Read the full forecast</a>
        </section>
      )}

      {/* Getting there ------------------------------------------------------------------------ */}
      <section className="chart-card">
        <header><h3>Getting there</h3></header>
        <dl className="facts num">
          <div><dt>Base</dt><dd>{fmtElev(r.b, units)}</dd></div>
          <div><dt>Summit</dt><dd>{fmtElev(r.t, units)}</dd></div>
          <div><dt>Vertical</dt><dd>{fmtElev(r.t - r.b, units)}</dd></div>
          {r.li > 0 && <div><dt>Lifts</dt><dd>{r.li}</dd></div>}
        </dl>
        <div className="links">
          <a className="ghost-btn" href={`https://www.google.com/maps/dir/?api=1&destination=${r.la},${r.lo}`} target="_blank" rel="noreferrer">Directions</a>
          {r.w && <a className="ghost-btn" href={r.w} target="_blank" rel="noreferrer">Resort site</a>}
          {r.sk && <a className="ghost-btn" href={`https://skimap.org/skiareas/view/${r.sk}`} target="_blank" rel="noreferrer">Official trail maps</a>}
        </div>
        {status && status.parking.length > 0 && <p className="hint">Parking: {status.parking.join(', ')}.</p>}
      </section>
    </>
  )
}
