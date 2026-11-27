import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Controls, FilterChips, FilterSheet, PeriodBar, type ControlState, type SheetSection } from './components/Controls.tsx'
import { Detail } from './components/Detail.tsx'
import { IconClose, IconMap, IconRank, IconSearch, IconStar, Logo } from './components/icons.tsx'
import { ProButton, usePlan } from './components/Plan.tsx'
import { Rankings } from './components/Rankings.tsx'
import { applyFilters, loadDataset, METRICS, NO_FILTERS, sortRows, valueOf, type Dataset, type Filters, type Metric, type Row, type SortKey } from './lib/data.ts'
import { fmtAgo, useAsync, useLocation, useMediaQuery, usePersisted, useSaved } from './lib/hooks.ts'
import { fetchData } from './lib/origin.ts'
import { reportAge, type ReportFile } from './lib/reports.ts'
import { MODELS, type Level } from './lib/models.ts'
import { allowedLevel, allowedMetric, allowedSort, levelNeeds, metricNeeds, passesNeed, savingNeeds, sortNeeds } from './lib/plan.ts'
import { defaultUnits, fmtSnow, type Units } from './lib/units.ts'

// The map brings a large library with it: load it only when the Map tab is opened.
const MapView = lazy(() => import('./components/MapView.tsx'))

type Tab = 'rank' | 'map' | 'saved'
const TABS: { id: Tab; label: string; icon: () => React.ReactNode }[] = [
  { id: 'rank', label: 'Rankings', icon: () => <IconRank /> },
  { id: 'map', label: 'Map', icon: () => <IconMap /> },
  { id: 'saved', label: 'Saved', icon: () => <IconStar /> },
]

/** The open resort lives in the URL hash, so the phone's back gesture closes the panel. */
function useOpenResort(): [string | null, (id: string | null) => void] {
  const read = () => new URLSearchParams(location.hash.slice(1)).get('r')
  const [id, setId] = useState<string | null>(read)
  // Whether the panel was opened from inside the app (a history entry we added) or by landing on
  // a shared link: only the first may be closed by going back.
  const pushed = useRef(false)
  useEffect(() => {
    const on = () => {
      const next = read()
      if (!next) pushed.current = false
      setId(next)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const open = useCallback((next: string | null) => {
    if (next) {
      pushed.current = true
      location.hash = `r=${next}`
    } else if (pushed.current) {
      history.back()
    } else {
      history.replaceState(null, '', location.pathname + location.search)
      setId(null)
    }
  }, [])
  return [id, open]
}

/** For the free plan: what the 7-day outlook holds, without saying where. */
function OutlookTeaser({ rows, units, onAsk }: { rows: readonly Row[]; units: Units; onAsk: () => void }) {
  const totals = rows.map((row) => valueOf(row, 'w7', 'mid') ?? 0)
  const most = Math.max(0, ...totals)
  const footOrMore = totals.filter((cm) => cm >= 30).length
  if (most < 15) return null
  return (
    <button type="button" className="teaser" onClick={onAsk}>
      <span>
        <b>{fmtSnow(most, units)} is on the way to one mountain in the next 7 days</b>
        {footOrMore > 1 && <>, and {footOrMore.toLocaleString('en-US')} mountains expect {units === 'metric' ? '30 cm' : 'a foot'} or more</>}.
      </span>
      <span className="teaser-cta">See where with Pro</span>
    </button>
  )
}

export function App() {
  const [data, setData] = useState<Dataset | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('rank')
  const [reportsOnly, setReportsOnly] = useState(false)
  // Independent of forecasts: a missing report snapshot must never block the rest of the site.
  const reports = useAsync(async signal => {
    const res = await fetchData('reports.json', { signal })
    if (!res.ok) throw Error('Reports unavailable')
    const file: ReportFile = await res.json()
    if (file.version !== 1 || !file.resorts) throw Error('Invalid report snapshot')
    return file
  }, [])
  const recentOperators = useMemo(() => new Set(reports.status === 'ready' ? Object.entries(reports.data.resorts)
    .filter(([,items]) => items.some(report => report.kind === 'operator' && report.readings.some(r => reportAge(r.at) === 'recent')))
    .map(([id]) => id) : []), [reports])
  const [units, setUnits] = usePersisted<Units>('units', defaultUnits)
  const [metric, setMetricRaw] = usePersisted<Metric>('metric', 'w7')
  const [storedLevel, setLevelRaw] = usePersisted<Level>('level', 'mid')
  const [stored, setStored] = usePersisted<Pick<Filters, 'passes' | 'region' | 'minVert'>>('filters', NO_FILTERS)
  const [query, setQuery] = useState('')
  const [sortRaw, setSortRaw] = useState<{ key: SortKey; desc: boolean }>({ key: 'snow', desc: true })
  const [sheet, setSheet] = useState<SheetSection | null>(null)
  const [openId, setOpenId] = useOpenResort()
  const { saved, isSaved, toggle: toggleSavedRaw } = useSaved()
  const [locating, locate] = useLocation()
  const wide = useMediaQuery('(min-width: 1000px)')
  const dark = useMediaQuery('(prefers-color-scheme: dark)')
  const { plan, ask } = usePlan()

  useEffect(() => {
    loadDataset().then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  // What is remembered may be more than the plan allows (a first visit defaults to 7 days; a
  // subscription can lapse): show the nearest thing the plan does allow.
  const metricOk = allowedMetric(plan, METRICS.some((m) => m.id === metric) ? metric : 'w7')
  const level = allowedLevel(plan, storedLevel)
  const sort = allowedSort(plan, sortRaw)
  // A remembered pass can disappear when rosters are rebuilt: drop it rather than show nothing.
  const knownPasses = (stored.passes ?? []).filter((slug) => !data || data.passes.some((pass) => pass.slug === slug))
  const filters: Filters = { ...NO_FILTERS, ...stored, passes: passesNeed(plan, knownPasses) ? [] : knownPasses, query }

  // Every choice Pro gates goes through here: reaching for one opens the paywall instead.
  const gated = <T,>(needs: (value: T) => ReturnType<typeof metricNeeds>, set: (value: T) => void) => (value: T) => {
    const feature = needs(value)
    if (feature) ask(feature)
    else set(value)
  }
  const setFilters = (f: Filters) => {
    const feature = passesNeed(plan, f.passes)
    if (feature) ask(feature)
    setStored({ passes: feature ? [] : f.passes, region: f.region, minVert: f.minVert })
    setQuery(f.query)
  }
  const setMetricOnly = gated((m: Metric) => metricNeeds(plan, m), setMetricRaw)
  // Picking a snowfall period means "rank by it": switch back to the snowfall sort.
  const setMetric = gated((m: Metric) => metricNeeds(plan, m), (m) => {
    setMetricRaw(m)
    setSortRaw({ key: 'snow', desc: true })
  })
  const setLevel = gated((l: Level) => levelNeeds(plan, l), setLevelRaw)
  // Sorting by distance needs a position: ask for it the moment it is chosen.
  const setSort = gated((s: { key: SortKey; desc: boolean }) => sortNeeds(plan, s.key), (s) => {
    if (s.key === 'near' && locating.status !== 'ready') locate()
    setSortRaw(s)
  })
  const toggleSaved = (id: string) => {
    const feature = isSaved(id) ? null : savingNeeds(plan, saved.length)
    if (feature) ask(feature)
    else toggleSavedRaw(id)
  }
  const here = locating.status === 'ready' ? locating.here : null

  // Until a position is known, "nearest to me" falls back to the snowfall ranking.
  const order = useMemo(() => (sort.key === 'near' && !here ? { key: 'snow' as SortKey, desc: true } : sort), [sort, here])

  const filterKey = JSON.stringify(filters)
  const filtered = useMemo(() => (data ? applyFilters(data.rows, filters) : []), [data, filterKey])
  const sorted = useMemo(() => sortRows(filtered, order.key, order.desc, metricOk, level, here), [filtered, order, metricOk, level, here])
  // Saved mountains ignore the pass, region and size filters, but the search box still narrows them.
  const savedRows = useMemo(() => {
    if (!data) return []
    const mine = applyFilters(data.rows.filter((row) => saved.includes(row.r.id)), { ...NO_FILTERS, query })
    return sortRows(mine, order.key, order.desc, metricOk, level, here)
  }, [data, saved, query, order, metricOk, level, here])
  const reportedRows = useMemo(() => sorted.filter(row => recentOperators.has(row.r.id)), [sorted, recentOperators])
  const ranked = reportsOnly ? reportedRows : sorted
  const measured = useMemo(() => ranked.filter((row) => row.o).length, [ranked])
  const openRow = data && openId ? data.rows.find((row) => row.r.id === openId) : undefined
  const closeDetail = useCallback(() => setOpenId(null), [setOpenId])

  if (error) return <div className="fatal">Could not load the forecast data ({error}). Check the connection and reload.</div>
  if (!data) return <div className="loading"><Logo size={44} /><p>Loading the latest snow forecast…</p></div>

  const control: ControlState = { rows: data.rows, passes: data.passes, units, setUnits, level, setLevel, filters, setFilters, sort, setSort }
  const listProps = { passes: data.passes, units, dark, metric: metricOk, setMetric: setMetricOnly, level, sort, setSort, here, wide, isSaved, toggleSaved, onOpen: setOpenId }

  return (
    <div className={`app is-${tab}`}>
      <div className="chrome">
        <header className="topbar">
          <a className="brand" href="./" aria-label="Powtracker home">
            <Logo />
            <span>Powtracker</span>
          </a>
          <label className="search">
            <IconSearch />
            <span className="sr-only">Search mountains</span>
            <input id="f-q" type="search" placeholder="Search mountains, regions, countries" value={query} onChange={(e) => setQuery(e.target.value)} enterKeyHint="search" autoComplete="off" />
            {query && <button type="button" aria-label="Clear the search" onClick={() => setQuery('')}><IconClose size={16} /></button>}
          </label>
          {wide && (
            <nav className="toptabs" role="tablist">
              {TABS.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
                  {t.label}{t.id === 'saved' && saved.length > 0 && <span className="count">{saved.length}</span>}
                </button>
              ))}
            </nav>
          )}
          <ProButton />
        </header>
        <PeriodBar metric={metricOk} setMetric={setMetric} />
      </div>

      {tab !== 'saved' && (wide ? <Controls {...control} /> : <FilterChips {...control} onOpen={setSheet} />)}

      <main>
        {sort.key === 'near' && locating.status === 'asking' && <p className="notice">Finding where you are…</p>}
        {sort.key === 'near' && locating.status === 'failed' && (
          <p className="notice">{locating.message} Sorting by distance needs it, so the list is ranked by snowfall for now. <button type="button" className="link-btn" onClick={locate}>Try again</button></p>
        )}

        {tab === 'rank' && (
          <>
            <p className="summary">
              <b>{ranked.length.toLocaleString('en-US')}</b> mountains · updated {fmtAgo(data.generated)} · {MODELS.length} weather models
              {measured > 0 && <> · {measured.toLocaleString('en-US')} with station readings</>}
            </p>
            {reports.status === 'ready' && <label className="check"><input type="checkbox" checked={reportsOnly} onChange={e => setReportsOnly(e.target.checked)} /> Only mountains with a resort report in the last 36 hours ({reportedRows.length})</label>}
            {plan === 'free' && <OutlookTeaser rows={data.rows} units={units} onAsk={() => ask('outlook')} />}
            <Rankings {...listProps} rows={ranked} empty={<><b>No mountains match.</b><span>Try a different search or loosen the filters.</span></>} />
          </>
        )}
        {tab === 'saved' && (
          <>
            <p className="summary"><b>{savedRows.length}</b> saved {savedRows.length === 1 ? 'mountain' : 'mountains'} · updated {fmtAgo(data.generated)}</p>
            <Rankings
              {...listProps}
              rows={savedRows}
              empty={
                saved.length > 0 ? (
                  <><b>None of your saved mountains match.</b><span>Clear the search to see all {saved.length}.</span></>
                ) : (
                  <><IconStar size={30} /><b>No saved mountains yet.</b><span>Tap the star on any mountain to keep it here.</span><button type="button" className="primary-btn" onClick={() => setTab('rank')}>Browse the rankings</button></>
                )
              }
            />
          </>
        )}
        {tab === 'map' && (
          <Suspense fallback={<div className="loading">Loading the map…</div>}>
            <MapView rows={filtered} fitKey={filterKey} metric={metricOk} level={level} units={units} dark={dark} generated={data.generated} onOpen={setOpenId} />
          </Suspense>
        )}
      </main>

      {tab !== 'map' && (
        <footer className="about">
          <details>
            <summary>How the numbers are made</summary>
            <p>The resort snow report is separate from the forecast. Where available, it shows snowfall and surface conditions from the operator’s published report, with its own location, period, time and source link. Nearby LTS measuring points in Italy (CC0, South Tyrol Open Data Hub) and National Observatory of Athens gauges at Greek ski centers are labelled as station reports. A missing rainfall amount is not zero.</p>
            <p>
              Every mountain gets the hourly precipitation and temperature forecast of {MODELS.length} independent weather models ({MODELS.map((m) => m.label).join(', ')}).
              Snowfall is worked out separately for the base, the middle and the summit: colder air higher up turns rain to snow and makes lighter, deeper snow from the
              same water. The headline is the consensus of the models. Confidence is high when the middle half of the models sit within about a quarter of the total on
              either side, and low when they span more than the total itself. All {MODELS.length} models cover the first days;{' '}
              {MODELS.filter((m) => m.horizonDays >= 14).length} reach 14 days, so long-range totals are a guide, not a promise.
            </p>
            <p>
              Forecast data: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> (ECMWF, NOAA, DWD, Environment Canada, JMA, UK Met Office, Météo-France).
              Mountains and elevations: <a href="https://openskimap.org/" target="_blank" rel="noreferrer">OpenSkiMap</a>, OpenStreetMap contributors. Radar: RainViewer.
              Snow measured on the ground comes from official stations within 10 km of a mountain and at its height: NOAA and USDA NRCS SNOTEL (United States), <a href="https://www.data.gouv.fr/datasets/archive-reseau-nivo-meteorologique/" target="_blank" rel="noreferrer">Météo-France mountain stations</a> (Licence Ouverte 2.0), the Japan Meteorological
              Agency, SLF (Switzerland), GeoSphere Austria, the avalanche services of Tirol, South Tyrol and Trentino, and British Columbia's snow weather stations. Readings
              that no neighbouring station supports are left out. Pass rosters are checked against each pass's own listing; confirm with the pass before you travel.
            </p>
          </details>
        </footer>
      )}

      {!wide && (
        <nav className="bottomnav" role="tablist" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
              {t.icon()}
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      )}

      {sheet && <FilterSheet {...control} section={sheet} count={filtered.length} onClose={() => setSheet(null)} />}
      {openRow && (
        <Detail
          key={openRow.r.id}
          row={openRow}
          obs={openRow.o}
          reports={reports}
          passes={data.passes}
          units={units}
          dark={dark}
          metric={metricOk}
          level={level}
          generated={data.generated}
          saved={isSaved(openRow.r.id)}
          onToggleSaved={() => toggleSaved(openRow.r.id)}
          plan={plan}
          onAsk={ask}
          onClose={closeDetail}
        />
      )}
    </div>
  )
}
