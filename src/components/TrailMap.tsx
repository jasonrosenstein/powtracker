// A mountain's trail map: its runs coloured by difficulty and its lifts, drawn over shaded
// terrain. Where the resort publishes live status, closed runs and lifts fade to grey. Tap a run
// or lift for its details; the 3D button tilts the map onto real terrain.
import 'maplibre-gl/dist/maplibre-gl.css'
import { Map as MlMap, NavigationControl, Popup, setWorkerUrl, type GeoJSONSource, type MapLayerMouseEvent } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useEffect, useRef, useState } from 'react'
import type { OpenState } from '../lib/status.ts'
import { liftTypeName, runLabel, type DifficultyClass, type Trails } from '../lib/trails.ts'
import { fmtElev, type Units } from '../lib/units.ts'

setWorkerUrl(workerUrl)

const STYLES = { light: 'https://tiles.openfreemap.org/styles/positron', dark: 'https://tiles.openfreemap.org/styles/dark' }
const CASING = { light: '#ffffff', dark: '#dfe7f3' }
const INK = { light: '#0c1524', dark: '#eef3fb' }
const HALO = { light: '#ffffff', dark: '#101826' }
const CLOSED = '#9aa3b2'
/** Mapzen terrain tiles, an AWS open dataset: elevation packed into PNG colour channels. */
const DEM = { type: 'raster-dem' as const, tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium' as const, tileSize: 256, maxzoom: 14, attribution: 'Terrain: Mapzen, AWS Open Data' }

export interface TrailMapProps {
  trails: Trails
  classes: DifficultyClass[]
  /** Live state of a run or lift by its index, where the resort publishes it. */
  runState?: (index: number) => OpenState | undefined
  liftState?: (index: number) => OpenState | undefined
  runNote?: (index: number) => string
  liftNote?: (index: number) => string
  units: Units
  dark: boolean
}

export default function TrailMap(p: TrailMapProps) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const [ready, setReady] = useState(false)
  const [tilted, setTilted] = useState(false)
  const [full, setFull] = useState(false)
  const theme = p.dark ? 'dark' : 'light'
  // The click handler is bound once; it reads the latest props through this ref.
  const latest = useRef(p)
  latest.current = p

  useEffect(() => {
    if (!el.current || !p.trails.bounds) return
    const [w, s, e, n] = p.trails.bounds
    const map = new MlMap({
      container: el.current,
      style: STYLES[theme],
      bounds: [[w, s], [e, n]],
      fitBoundsOptions: { padding: 36, maxZoom: 15 },
      attributionControl: { compact: true },
      maxPitch: 70,
    })
    map.addControl(new NavigationControl({ showCompass: true, visualizePitch: true }), 'top-right')
    mapRef.current = map

    map.on('load', () => {
      // Shade the terrain under everything the basemap labels.
      const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id
      map.addSource('dem', DEM)
      map.addSource('dem-3d', DEM)
      map.addLayer({ id: 'hillshade', type: 'hillshade', source: 'dem', paint: { 'hillshade-exaggeration': 0.45, 'hillshade-shadow-color': p.dark ? '#000000' : '#5a6b84' } }, firstSymbol)

      const empty = { type: 'FeatureCollection' as const, features: [] }
      map.addSource('runs', { type: 'geojson', data: empty })
      map.addSource('lifts', { type: 'geojson', data: empty })
      const width = (a: number, b: number) => ['interpolate', ['linear'], ['zoom'], 10, a, 15, b] as unknown as number
      const faded = ['case', ['==', ['get', 'state'], 'closed'], 0.55, 1] as unknown as number

      map.addLayer({ id: 'run-area', type: 'fill', source: 'runs', filter: ['==', ['get', 'area'], true], paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.16 } })
      map.addLayer({ id: 'run-casing', type: 'line', source: 'runs', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': CASING[theme], 'line-width': width(2.4, 6.5), 'line-opacity': faded } })
      map.addLayer({ id: 'run-line', type: 'line', source: 'runs', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': width(1.2, 3.8) } })
      map.addLayer({ id: 'lift-casing', type: 'line', source: 'lifts', paint: { 'line-color': HALO[theme], 'line-width': width(2.6, 5), 'line-opacity': 0.9 } })
      map.addLayer({ id: 'lift-line', type: 'line', source: 'lifts', paint: { 'line-color': ['get', 'color'], 'line-width': width(1.2, 2.4) } })
      map.addLayer({ id: 'lift-ends', type: 'circle', source: 'lifts', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': width(1.8, 4), 'circle-color': ['get', 'color'], 'circle-stroke-color': HALO[theme], 'circle-stroke-width': 1.2 } })
      const label = { 'text-font': ['Noto Sans Regular'], 'symbol-placement': 'line' as const, 'text-field': ['get', 'name'] as unknown as string, 'text-max-angle': 35 }
      const labelPaint = { 'text-color': INK[theme], 'text-halo-color': HALO[theme], 'text-halo-width': 1.6 }
      map.addLayer({ id: 'run-names', type: 'symbol', source: 'runs', minzoom: 13, layout: { ...label, 'text-size': 11 }, paint: labelPaint })
      map.addLayer({ id: 'lift-names', type: 'symbol', source: 'lifts', minzoom: 12.3, filter: ['==', ['geometry-type'], 'LineString'], layout: { ...label, 'text-size': 11.5, 'text-font': ['Noto Sans Bold'] }, paint: labelPaint })
      // Wide invisible lines, so a thumb can pick a run.
      map.addLayer({ id: 'run-hit', type: 'line', source: 'runs', paint: { 'line-width': 18, 'line-opacity': 0 } })
      map.addLayer({ id: 'lift-hit', type: 'line', source: 'lifts', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-width': 18, 'line-opacity': 0 } })

      const popup = (e: MapLayerMouseEvent, lines: string[]) => {
        const node = document.createElement('div')
        lines.filter(Boolean).forEach((text, i) => {
          const row = document.createElement('div')
          row.className = i === 0 ? 'pop-name' : 'muted'
          row.textContent = text
          node.appendChild(row)
        })
        new Popup({ offset: 8, maxWidth: '240px' }).setLngLat(e.lngLat).setDOMContent(node).addTo(map)
      }
      map.on('click', 'lift-hit', (e) => {
        const i = Number(e.features?.[0]?.properties.i)
        const lift = latest.current.trails.lifts[i]
        if (!lift) return
        const u = latest.current.units
        popup(e, [lift.name || liftTypeName(lift.type), liftTypeName(lift.type), `${fmtElev(lift.verticalM, u)} of rise over ${fmtElev(lift.lengthM, u)}`, latest.current.liftNote?.(i) ?? ''])
      })
      map.on('click', 'run-hit', (e) => {
        // A lift under the same tap wins: it is the thinner target.
        if (map.queryRenderedFeatures(e.point, { layers: ['lift-hit'] }).length) return
        const i = Number(e.features?.[0]?.properties.i)
        const run = latest.current.trails.runs[i]
        if (!run) return
        const u = latest.current.units
        const traits = [run.groomed ? 'groomed' : run.ungroomed ? 'ungroomed' : '', run.gladed ? 'glades' : '', run.lit ? 'lit at night' : ''].filter(Boolean).join(', ')
        popup(e, [runLabel(run) || 'Unnamed run', `${latest.current.classes[run.cls].label}${traits ? `, ${traits}` : ''}`, `${fmtElev(run.verticalM, u)} of drop over ${fmtElev(run.lengthM, u)}`, latest.current.runNote?.(i) ?? ''])
      })
      for (const layer of ['run-hit', 'lift-hit']) {
        map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'))
        map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''))
      }
      setReady(true)
    })
    return () => {
      setReady(false)
      setTilted(false)
      mapRef.current = null
      map.remove()
    }
  }, [theme, p.trails])

  // Runs and lifts, recoloured whenever live status arrives.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const line = (coords: [number, number][], area: boolean) => (area ? { type: 'Polygon' as const, coordinates: [coords] } : { type: 'LineString' as const, coordinates: coords })
    // With a live report, colour means "the resort says this is open": a run that is closed, on
    // hold, or missing from the report is grey. Without one, every run shows its difficulty.
    const live = (state: OpenState | undefined, has: boolean) => (!has ? 'none' : state === 'open' ? 'open' : 'closed')
    const runs = p.trails.runs.map((run, i) => {
      const state = live(p.runState?.(i), p.runState != null)
      return { type: 'Feature' as const, geometry: line(run.line, run.area), properties: { i, name: runLabel(run), area: run.area, state, color: state === 'closed' ? CLOSED : p.classes[run.cls].color } }
    })
    // Easier classes are drawn last so a green is never hidden under a black.
    runs.sort((a, b) => p.trails.runs[b.properties.i].cls - p.trails.runs[a.properties.i].cls)
    const lifts = p.trails.lifts.flatMap((lift, i) => {
      const state = live(p.liftState?.(i), p.liftState != null)
      const props = { i, name: lift.name, state, color: state === 'closed' ? CLOSED : INK[theme] }
      const ends = [lift.line[0], lift.line[lift.line.length - 1]]
      return [
        { type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: lift.line }, properties: props },
        ...ends.map((c) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: c }, properties: props })),
      ]
    })
    ;(map.getSource('runs') as GeoJSONSource).setData({ type: 'FeatureCollection', features: runs })
    ;(map.getSource('lifts') as GeoJSONSource).setData({ type: 'FeatureCollection', features: lifts })
  }, [ready, p.trails, p.classes, p.runState, p.liftState, theme])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    map.setTerrain(tilted ? { source: 'dem-3d', exaggeration: 1.3 } : null)
    // Re-frame the mountain for the new angle: a tilted camera over real terrain sits further back.
    const [w, s, e, n] = p.trails.bounds!
    map.fitBounds([[w, s], [e, n]], { pitch: tilted ? 58 : 0, bearing: tilted ? map.getBearing() : 0, padding: tilted ? 0 : 36, maxZoom: 15, duration: 700 })
  }, [ready, tilted])

  // Full screen changes the box the map draws into.
  useEffect(() => {
    mapRef.current?.resize()
    document.body.classList.toggle('map-full', full)
    return () => document.body.classList.remove('map-full')
  }, [full])

  if (!p.trails.bounds) return null
  return (
    <div className={full ? 'trailmap is-full' : 'trailmap'}>
      <div className="map" ref={el} />
      {!ready && <div className="map-loading">Loading the trail map…</div>}
      <div className="trailmap-tools">
        <button type="button" className="icon-btn" aria-pressed={tilted} onClick={() => setTilted(!tilted)}>3D</button>
        <button type="button" className="icon-btn" aria-pressed={full} onClick={() => setFull(!full)}>{full ? 'Close map' : 'Full screen'}</button>
      </div>
    </div>
  )
}
