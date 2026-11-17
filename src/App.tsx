import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Controls, FilterChips, FilterSheet, PeriodBar, type ControlState, type SheetSection } from './components/Controls.tsx'
import { Detail } from './components/Detail.tsx'
import { IconClose, IconMap, IconRank, IconSearch, IconStar, Logo } from './components/icons.tsx'
import { Rankings } from './components/Rankings.tsx'
import { applyFilters, loadDataset, METRICS, NO_FILTERS, sortRows, type Dataset, type Filters, type Metric, type SortKey } from './lib/data.ts'
import { fmtAgo, useLocation, useMediaQuery, usePersisted, useSaved } from './lib/hooks.ts'
import { MODELS, type Level } from './lib/models.ts'
import { defaultUnits, type Units } from './lib/units.ts'

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

export function App() {
  const [data, setData] = useState<Dataset | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('rank')
  const [units, setUnits] = usePersisted<Units>('units', defaultUnits)
  const [metric, setMetricRaw] = usePersisted<Metric>('metric', 'w7')
  const [level, setLevel] = usePersisted<Level>('level', 'mid')
  const [stored, setStored] = usePersisted<Pick<Filters, 'passes' | 'region' | 'minVert'>>('filters', NO_FILTERS)
  const [query, setQuery] = useState('')
  const [sort, setSortRaw] = useState<{ key: SortKey; desc: boolean }>({ key: 'snow', desc: true })
  const [sheet, setSheet] = useState<SheetSection | null>(null)
  const [openId, setOpenId] = useOpenResort()
  const { saved, isSaved, toggle: toggleSaved } = useSaved()
  const [locating, locate] = useLocation()
  const wide = useMediaQuery('(min-width: 1000px)')
  const dark = useMediaQuery('(prefers-color-scheme: dark)')

  useEffect(() => {
    loadDataset().then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const metricOk = METRICS.some((m) => m.id === metric) ? metric : 'w7'
  // A remembered pass can disappear when rosters are rebuilt: drop it rather than show nothing.
  const knownPasses = (stored.passes ?? []).filter((slug) => !data || data.passes.some((pass) => pass.slug === slug))
  const filters: Filters = { ...NO_FILTERS, ...stored, passes: knownPasses, query }
  const setFilters = (f: Filters) => {
    setStored({ passes: f.passes, region: f.region, minVert: f.minVert })
    setQuery(f.query)
  }
  // Picking a snowfall period means "rank by it": switch back to the snowfall sort.
  const setMetric = (m: Metric) => {
    setMetricRaw(m)
    setSortRaw({ key: 'snow', desc: true })
  }
  // Sorting by distance needs a position: ask for it the moment it is chosen.
  const setSort = (s: { key: SortKey; desc: boolean }) => {
    if (s.key === 'near' && locating.status !== 'ready') locate()
    setSortRaw(s)
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
  const openRow = data && openId ? data.rows.find((row) => row.r.id === openId) : undefined
  const closeDetail = useCallback(() => setOpenId(null), [setOpenId])

  if (error) return <div className="fatal">Could not load the forecast data ({error}). Check the connection and reload.</div>
  if (!data) return <div className="loading"><Logo size={44} /><p>Loading the latest snow forecast…</p></div>

  const control: ControlState = { rows: data.rows, passes: data.passes, units, setUnits, level, setLevel, filters, setFilters, sort, setSort }
  const listProps = { passes: data.passes, observations: data.observations, units, dark, metric: metricOk, setMetric: setMetricRaw, level, sort, setSort, here, wide, isSaved, toggleSaved, onOpen: setOpenId }

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
              <b>{sorted.length.toLocaleString('en-US')}</b> mountains · updated {fmtAgo(data.generated)} · {MODELS.length} weather models
            </p>
            <Rankings {...listProps} rows={sorted} empty={<><b>No mountains match.</b><span>Try a different search or loosen the filters.</span></>} />
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
              Station measurements: SLF. Pass rosters are checked against each pass's own listing; confirm with the pass before you travel.
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
          obs={data.observations[openRow.r.id]}
          passes={data.passes}
          units={units}
          metric={metricOk}
          level={level}
          generated={data.generated}
          saved={isSaved(openRow.r.id)}
          onToggleSaved={() => toggleSaved(openRow.r.id)}
          onClose={closeDetail}
        />
      )}
    </div>
  )
}
