// The map: every mountain as a circle sized and shaded by snowfall, over an optional animated
// weather layer (live radar, or a model field stepped through the forecast).
import 'maplibre-gl/dist/maplibre-gl.css'
import { addProtocol, Map as MlMap, NavigationControl, Popup, setWorkerUrl, type AddProtocolAction, type GeoJSONSource, type MapLayerMouseEvent, type RasterTileSource } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useEffect, useMemo, useRef, useState } from 'react'
import { LEVEL_INDEX, METRICS, snowOf, type Metric, type Row } from '../lib/data.ts'
import { LEVEL_LABELS, type Level } from '../lib/models.ts'
import { snowClass, snowColor, snowRadius, snowScale } from '../lib/scale.ts'
import { fmtSnow, fmtSnowNum, snowUnit, snowUnitName, type Units } from '../lib/units.ts'
import { fetchModelRun, fetchRadar, MODEL_LAYERS, modelSourceUrl, radarTiles, SNOWFALL_SCALE, type ModelRun, type OverlayId, type RadarFrames } from '../lib/weather-layers.ts'
import { Segmented } from './Controls.tsx'
import { IconPause, IconPlay } from './icons.tsx'

setWorkerUrl(workerUrl)

const STYLES = { light: 'https://tiles.openfreemap.org/styles/positron', dark: 'https://tiles.openfreemap.org/styles/dark' }
// The card surface and ink of styles.css, for the rings and labels MapLibre draws itself.
const SURFACE = { light: '#ffffff', dark: '#101826' }
const INK = { light: '#0c1524', dark: '#eef3fb' }
const CIRCLES = 'resort-circles'
const DAY_MS = 86_400_000

/**
 * The view for a worldwide set of mountains. A wide map shows the whole northern hemisphere; a
 * phone-shaped one would show mostly ocean, so it opens on the viewer's own longitude instead
 * (15° per hour of their clock's offset from UTC).
 */
function worldView(container: HTMLElement): { center: [number, number]; zoom: number } {
  if (container.clientWidth >= 600) return { center: [-40, 38], zoom: 1.2 }
  const lon = Math.max(-150, Math.min(150, -new Date().getTimezoneOffset() / 4))
  return { center: [lon, 44], zoom: 2.2 }
}

let omRegistered = false
type LegendScale = { breakpoints: number[]; colors: [number, number, number, number][] }
let getScale: ((variable: string, dark: boolean) => LegendScale) | null = null

/** Load the model-layer renderer on first use: it is large, and most visits never need it. */
async function ensureOmProtocol(): Promise<void> {
  if (omRegistered) return
  const om = await import('@openmeteo/mapbox-layer')
  const colorScales = { ...om.COLOR_SCALES_WITH_ALIASES, snowfall_water_equivalent: SNOWFALL_SCALE }
  const settings = { ...om.defaultOmProtocolSettings, colorScales }
  // The package types its result for an older MapLibre (a cancelled tile resolves to null).
  addProtocol('om', (params, abort) => om.omProtocol(params, abort, settings) as ReturnType<AddProtocolAction>)
  getScale = (variable, dark) => om.getColorScale(variable, dark, colorScales) as unknown as LegendScale
  // Moving the timeline cancels the previous step's download, and the package lets that
  // cancellation escape as an unhandled AbortError. A cancelled request is not a failure.
  window.addEventListener('unhandledrejection', (e) => {
    if ((e.reason as { name?: string } | null)?.name === 'AbortError') e.preventDefault()
  })
  omRegistered = true
}

export interface MapViewProps {
  rows: readonly Row[]
  /** Changes when the filters do, so the map can frame the new set of mountains. */
  fitKey: string
  metric: Metric
  level: Level
  units: Units
  dark: boolean
  generated: Date
  onOpen: (id: string) => void
}

export default function MapView(p: MapViewProps) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const [ready, setReady] = useState(false)
  const [bubbles, setBubbles] = useState<'total' | 'daily'>('total')
  const [overlay, setOverlay] = useState<OverlayId>('none')
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [run, setRun] = useState<ModelRun | null>(null)
  const [radar, setRadar] = useState<RadarFrames | null>(null)
  const [radarFrame, setRadarFrame] = useState(0)
  const [note, setNote] = useState('')
  const [legendScale, setLegendScale] = useState<LegendScale | null>(null)
  // On a phone the legend starts folded to its title, leaving the map to the mountains.
  const [legendOpen, setLegendOpen] = useState(() => window.matchMedia('(min-width: 720px)').matches)
  const onOpen = useRef(p.onOpen)
  onOpen.current = p.onOpen

  const theme = p.dark ? 'dark' : 'light'
  const modelLayer = MODEL_LAYERS.find((l) => l.id === overlay)
  // The timeline counts calendar dates from the snapshot's UTC date. Each mountain's days are its
  // own local days, so a date is looked up per mountain (see dayIndex below).
  const day0 = useMemo(() => Math.floor(p.generated.getTime() / DAY_MS) * DAY_MS, [p.generated])

  // The timeline runs over model steps when a model layer is on, else over the forecast days.
  const steps = modelLayer && run ? run.steps.length : 14
  const hasTimeline = bubbles === 'daily' || (modelLayer != null && run != null)
  const stepMs = modelLayer && run ? (run.steps[Math.min(step, run.steps.length - 1)]?.ms ?? day0) : day0 + step * DAY_MS
  const dateMs = Math.floor(stepMs / DAY_MS) * DAY_MS

  // --- Map lifecycle ---------------------------------------------------------------------------
  useEffect(() => {
    if (!el.current) return
    const map = new MlMap({
      container: el.current,
      style: STYLES[theme],
      ...worldView(el.current),
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    })
    map.touchZoomRotate.disableRotation()
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map

    map.on('load', () => {
      map.addSource('resorts', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: CIRCLES,
        type: 'circle',
        source: 'resorts',
        layout: { 'circle-sort-key': ['get', 'v'] },
        paint: {
          // Circles shrink when the whole world is on screen, so ranges do not merge into one blob.
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, ['max', 1.5, ['*', ['get', 'r'], 0.3]], 5.5, ['get', 'r']],
          'circle-color': ['get', 'c'],
          'circle-opacity': 0.92,
          'circle-stroke-color': SURFACE[theme],
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 1, 0.5, 5.5, 1.5],
        },
      })
      // A generous invisible target, so a thumb can hit a 3 px dot.
      map.addLayer({
        id: 'resort-hit',
        type: 'circle',
        source: 'resorts',
        layout: { 'circle-sort-key': ['get', 'v'] },
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 6, 5.5, ['max', ['get', 'r'], 14]], 'circle-opacity': 0 },
      })
      map.addLayer({
        id: 'resort-labels',
        type: 'symbol',
        source: 'resorts',
        minzoom: 5,
        layout: {
          'text-field': ['get', 't'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11.5,
          'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
          'text-radial-offset': ['+', 0.3, ['/', ['get', 'r'], 11.5]],
          'symbol-sort-key': ['-', 0, ['get', 'v']],
        },
        paint: { 'text-color': INK[theme], 'text-halo-color': SURFACE[theme], 'text-halo-width': 1.4 },
      })

      map.on('click', 'resort-hit', (e: MapLayerMouseEvent) => {
        const f = e.features?.[0]
        if (!f || f.geometry.type !== 'Point') return
        const props = f.properties as { id: string; n: string; label: string; where: string }
        const node = document.createElement('div')
        const add = (cls: string, text: string, tag = 'div') => {
          const child = document.createElement(tag)
          child.className = cls
          child.textContent = text
          node.appendChild(child)
          return child
        }
        add('pop-name', props.n)
        add('muted', props.where)
        add('pop-value', props.label)
        add('pop-btn', 'Open forecast', 'button').addEventListener('click', () => onOpen.current(props.id))
        new Popup({ offset: 12, maxWidth: '260px' }).setLngLat(f.geometry.coordinates as [number, number]).setDOMContent(node).addTo(map)
      })
      map.on('mouseenter', 'resort-hit', () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', 'resort-hit', () => (map.getCanvas().style.cursor = ''))
      setReady(true)
    })

    return () => {
      setReady(false)
      mapRef.current = null
      map.remove()
    }
  }, [theme])

  // --- Mountains ------------------------------------------------------------------------------
  const what = bubbles === 'daily' ? 'Snowfall that day' : METRICS.find((m) => m.id === p.metric)!.label
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const scale = snowScale(p.dark, p.units)
    const li = LEVEL_INDEX[p.level]
    // The mountain's own local day that falls on the timeline's date.
    const dayIndex = (d0: string) => Math.max(0, Math.min(13, Math.round((dateMs - Date.parse(`${d0}T00:00:00Z`)) / DAY_MS)))
    const features = p.rows.map((row) => {
      const cm = bubbles === 'daily' ? (row.f ? row.f.d[li][dayIndex(row.f.d0)] : null) : snowOf(row.f, p.metric, p.level)
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [row.r.lo, row.r.la] },
        properties: {
          id: row.r.id,
          n: row.r.n,
          where: [row.r.rg, row.r.co].filter(Boolean).join(', '),
          v: cm ?? -1,
          c: snowColor(cm, scale),
          r: snowRadius(cm, scale),
          t: snowClass(cm, scale) >= 0 ? `${row.r.n}\n${fmtSnowNum(cm, p.units)} ${snowUnit(p.units)}` : row.r.n,
          label: `${fmtSnow(cm, p.units)} · ${what.toLowerCase()}`,
        },
      }
    })
    ;(map.getSource('resorts') as GeoJSONSource).setData({ type: 'FeatureCollection', features })
  }, [ready, p.rows, p.metric, p.level, p.units, p.dark, bubbles, dateMs, what])

  // Frame the mountains whenever the filters change.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || p.rows.length === 0) return
    let w = 180, s = 90, e = -180, n = -90
    for (const row of p.rows) {
      w = Math.min(w, row.r.lo); e = Math.max(e, row.r.lo); s = Math.min(s, row.r.la); n = Math.max(n, row.r.la)
    }
    // A set that spans the globe is clearer from the default view than squeezed to its bounds.
    if (e - w > 200) map.easeTo({ ...worldView(map.getContainer()), duration: 600 })
    else map.fitBounds([[w, s], [e, n]], { padding: 60, maxZoom: 8, duration: 600 })
  }, [ready, p.fitKey])

  // --- Radar ----------------------------------------------------------------------------------
  useEffect(() => {
    if (overlay !== 'radar') return
    const ctl = new AbortController()
    fetchRadar(ctl.signal).then(setRadar).catch(() => !ctl.signal.aborted && setNote('Live radar is not reachable right now.'))
    return () => {
      ctl.abort()
      setRadar(null)
    }
  }, [overlay])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !radar) return
    // Every frame is its own layer, loaded up front and shown by opacity: no flicker between frames.
    radar.frames.forEach((frame, i) => {
      map.addSource(`radar-${i}`, { type: 'raster', tiles: [radarTiles(radar.host, frame.path)], tileSize: 256, maxzoom: 7, attribution: 'Radar: RainViewer' })
      map.addLayer({ id: `radar-${i}`, type: 'raster', source: `radar-${i}`, paint: { 'raster-opacity': 0, 'raster-opacity-transition': { duration: 0, delay: 0 }, 'raster-fade-duration': 0 } }, CIRCLES)
    })
    setRadarFrame(radar.frames.length - 1)
    const timer = setInterval(() => setRadarFrame((f) => (f + 1) % radar.frames.length), 550)
    return () => {
      clearInterval(timer)
      if (mapRef.current !== map) return
      radar.frames.forEach((_, i) => {
        map.removeLayer(`radar-${i}`)
        map.removeSource(`radar-${i}`)
      })
    }
  }, [ready, radar])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !radar) return
    radar.frames.forEach((_, i) => map.getLayer(`radar-${i}`) && map.setPaintProperty(`radar-${i}`, 'raster-opacity', i === radarFrame ? 0.75 : 0))
  }, [ready, radar, radarFrame])

  // --- Model field ----------------------------------------------------------------------------
  useEffect(() => {
    if (!modelLayer) return
    const ctl = new AbortController()
    setNote('')
    Promise.all([ensureOmProtocol(), fetchModelRun(Date.now(), ctl.signal)])
      .then(([, r]) => {
        if (ctl.signal.aborted) return
        setRun(r)
        setStep(0)
        setLegendScale(getScale ? getScale(modelLayer.id, p.dark) : null)
      })
      .catch(() => !ctl.signal.aborted && setNote('The model weather layer is not reachable right now.'))
    return () => ctl.abort()
  }, [modelLayer, p.dark])

  const stepIndex = modelLayer && run ? run.steps[Math.min(step, run.steps.length - 1)]?.index : undefined
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !modelLayer || stepIndex == null) return
    const url = modelSourceUrl(modelLayer.id, stepIndex, p.dark)
    const existing = map.getSource('om') as RasterTileSource | undefined
    if (existing) existing.setUrl(url)
    else {
      map.addSource('om', { type: 'raster', url, tileSize: 256, maxzoom: 10, attribution: 'Model field: NOAA GFS via Open-Meteo' })
      map.addLayer({ id: 'om', type: 'raster', source: 'om', paint: { 'raster-opacity': 0.8, 'raster-fade-duration': 0 } }, CIRCLES)
    }
  }, [ready, modelLayer, stepIndex, p.dark])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || modelLayer) return
    if (map.getLayer('om')) map.removeLayer('om')
    if (map.getSource('om')) map.removeSource('om')
    setRun(null)
    setLegendScale(null)
  }, [ready, modelLayer])

  // --- Timeline -------------------------------------------------------------------------------
  useEffect(() => {
    if (!hasTimeline) setPlaying(false)
    setStep((s) => Math.min(s, steps - 1))
  }, [hasTimeline, steps])

  useEffect(() => {
    if (!playing) return
    const map = mapRef.current
    let timer = 0
    const advance = () => setStep((s) => (s + 1) % steps)
    if (!modelLayer || !map) {
      timer = window.setTimeout(advance, 800)
      return () => clearTimeout(timer)
    }
    // A model field has to download each step: hold until its tiles are drawn, then move on, so
    // a slow connection plays slowly instead of skipping frames.
    const onIdle = () => (timer = window.setTimeout(advance, 450))
    if (map.areTilesLoaded()) onIdle()
    else map.once('idle', onIdle)
    return () => {
      clearTimeout(timer)
      map.off('idle', onIdle)
    }
  }, [playing, steps, modelLayer, step])

  const when = modelLayer && run
    ? new Date(stepMs).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : new Date(dateMs).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  const scale = snowScale(p.dark, p.units)
  const metricDef = METRICS.find((m) => m.id === p.metric)!

  return (
    <>
      <div className={hasTimeline ? 'map-shell has-timeline' : 'map-shell'}>
        <div className="map" ref={el} />
        {!ready && <div className="map-loading">Loading the map…</div>}

        <div className="map-panel layers">
          <div className="control">
            <span className="cap">Circles show</span>
            <Segmented
              label="What the circles show"
              options={[{ id: 'total', label: metricDef.past ? `Last ${metricDef.short}` : metricDef.short }, { id: 'daily', label: 'Day by day' }]}
              value={bubbles}
              onChange={(v) => setBubbles(v as 'total' | 'daily')}
            />
          </div>
          <div className="control">
            <label className="cap" htmlFor="m-overlay">Weather layer</label>
            <select id="m-overlay" value={overlay} onChange={(e) => { setNote(''); setOverlay(e.target.value) }}>
              <option value="none">None</option>
              <option value="radar">Live radar, last 2 hours</option>
              {MODEL_LAYERS.map((l) => <option key={l.id} value={l.id}>{l.label}, forecast</option>)}
            </select>
          </div>
        </div>

        <details className="map-panel legend-box" open={legendOpen} onToggle={(e) => setLegendOpen(e.currentTarget.open)}>
          <summary className="legend-title">{what} at {LEVEL_LABELS[p.level].toLowerCase()} elevation, {snowUnitName(p.units)}</summary>
          <div className="swatches">
            <span>
              <i style={{ width: 6, height: 6, background: scale.none }} />
              none
            </span>
            {scale.breaksCm.map((cm, i) => {
              // Each class is drawn at the size of a total in the middle of it.
              const r = snowRadius(i + 1 < scale.breaksCm.length ? (cm + scale.breaksCm[i + 1]) / 2 : cm * 1.3, scale)
              return (
                <span key={cm}>
                  <i style={{ width: r * 2, height: r * 2, background: scale.ramp[i] }} />
                  {scale.labels[i]}+
                </span>
              )
            })}
          </div>
          {modelLayer && legendScale && <ModelLegend layer={modelLayer} scale={legendScale} />}
          {overlay === 'radar' && radar && (
            <div className="map-note">Radar at {new Date(radar.frames[radarFrame].time * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}: rain and snow falling now</div>
          )}
          {note && <div className="map-note">{note}</div>}
        </details>

        {hasTimeline && (
          <div className="map-panel timeline">
            <button type="button" className="icon-btn is-round is-accent" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause the animation' : 'Play the animation'}>
              {playing ? <IconPause /> : <IconPlay />}
            </button>
            <span className="when">{when}</span>
            <input type="range" min={0} max={steps - 1} step={1} value={Math.min(step, steps - 1)} aria-label="Forecast time" onChange={(e) => { setPlaying(false); setStep(Number(e.target.value)) }} />
          </div>
        )}
      </div>
      <p className="map-foot">
        Tap a mountain for its forecast. Circles follow the filters above. Basemap: OpenFreeMap, OpenMapTiles, OpenStreetMap contributors.
      </p>
    </>
  )
}

function ModelLegend({ layer, scale }: { layer: (typeof MODEL_LAYERS)[number]; scale: LegendScale }) {
  // Show the part of the scale the ticks cover, as a strip of its classes.
  const lo = layer.ticks[0]
  const hi = layer.ticks[layer.ticks.length - 1]
  const cells = scale.breakpoints.map((b, i) => ({ b, color: scale.colors[Math.min(i, scale.colors.length - 1)] })).filter((c) => c.b >= lo && c.b <= hi)
  return (
    <div style={{ marginTop: 10 }}>
      <div className="legend-title">{layer.legend}</div>
      <div style={{ display: 'flex', height: 10, borderRadius: 3, overflow: 'hidden', minWidth: 180 }}>
        {cells.map((c) => (
          <i key={c.b} style={{ flex: 1, background: `rgba(${c.color[0]},${c.color[1]},${c.color[2]},${Math.max(c.color[3], 0.35)})` }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-2)', marginTop: 2 }} className="num">
        {layer.ticks.map((t) => <span key={t}>{t}</span>)}
      </div>
    </div>
  )
}
