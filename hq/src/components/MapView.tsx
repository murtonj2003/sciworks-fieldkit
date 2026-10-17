// All teams' points over the transect lines. No online tiles, ever: under the lines is either the satellite picture
// that came in the set-up bundle (a MapLibre image source fed from a blob URL, so it works with no internet) or a
// CSS grid behind a transparent canvas. Markers are the kit's own band marks (circle / triangle / diamond / hollow
// diamond), a mint ring means approved, a black ring means selected, and a dashed grey diamond is a point as typed
// before a fix (handoff §1.3). On the picture, marks, rings and lines get a white edge so they still read.

import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, ImageSource, MapLayerMouseEvent, StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre 6 runs its worker from a separate file: serve it ourselves so it is precached for offline use.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import type { Encounter, TransectCollection } from '@sciworks/shared'
import type { BasemapRow, RecordRow } from '../db'
import { Icon, Mark, SYMBOLS } from '../kit/Icons'
import { fmtNumber } from '../lib/format'

maplibregl.setWorkerUrl(workerUrl)

type Band = 'on' | 'near' | 'off' | 'outside'
const BAND_OF: Record<string, Band> = { green: 'on', amber: 'near', red: 'off', 'outside-bbox': 'outside' }

const STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#000000', 'background-opacity': 0 } }],
}

export type MapLayerChoice = 'satellite' | 'plain'

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

/**
 * Rasterises one of the kit's band-mark symbols with the live token colours. `edge` adds a 1.2 px contour in the
 * card colour that follows the shape, for marks drawn on the satellite picture.
 */
function markImage(symbol: string, color: string, glyph: string, hollow: string, edge?: string): Promise<HTMLImageElement> {
  const filter = edge
    ? `<filter id="e" x="-20%" y="-20%" width="140%" height="140%"><feMorphology in="SourceAlpha" operator="dilate" radius="1.2" result="d"/><feFlood flood-color="${edge}"/><feComposite in2="d" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
    : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 24 24" width="48" height="48" style="color:${color};--fk-glyph:${glyph};--fk-hollow:${hollow}">${filter}<g${edge ? ' filter="url(#e)"' : ''}>${symbol}</g></svg>`
  const img = new Image(48, 48)
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  return img.decode().then(() => img)
}

/** The picture's four corners for MapLibre: top-left, top-right, bottom-right, bottom-left. */
const corners = (b: BasemapRow['meta']['bounds']): [[number, number], [number, number], [number, number], [number, number]] => [
  [b.lonMin, b.latMax],
  [b.lonMax, b.latMax],
  [b.lonMax, b.latMin],
  [b.lonMin, b.latMin],
]

/** Layers that only show on the satellite picture: white edges under the lines and the selected ring. */
const SAT_ONLY = ['transect-edge', 'links-edge', 'selected-edge']

/** A "nice" scale-bar length (m) that fits in about 100 px. */
function scaleFor(map: maplibregl.Map): { metres: number; px: number } {
  const lat = map.getCenter().lat
  const mPerPx = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** map.getZoom())
  const steps = [10, 20, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000]
  const metres = [...steps].reverse().find((s) => s / mPerPx <= 110) ?? 10
  return { metres, px: Math.round(metres / mPerPx) }
}

export interface MapViewProps {
  transects?: TransectCollection
  records: RecordRow[]
  selectedKey?: string
  onSelect: (key: string) => void
  /** e.g. { team: 'Team B', line: 'Last handover Sat 17 Oct, 06:00' } for the selected record's team. */
  counter?: { team: string; line: string; sub?: string }
  /** Satellite pictures from the set-up bundle. With none, the map is plain and there is no switch. */
  basemaps?: BasemapRow[]
  layer: MapLayerChoice
  onLayer: (layer: MapLayerChoice) => void
}

export function MapView({ transects, records, selectedKey, onSelect, counter, basemaps = [], layer, onLayer }: MapViewProps) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [ready, setReady] = useState(false)
  const [scale, setScale] = useState({ metres: 500, px: 100 })
  // What the first view is framed on: the transects that have records (else all). Refit once data arrives.
  const fittedOn = useRef('')
  const labels = useRef<maplibregl.Marker[]>([])
  const notes = useRef<maplibregl.Marker[]>([])
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  // Which pictures are in view right now: their credit must be on screen whenever they are (CC BY 4.0).
  const pictures = useRef<BasemapRow['meta'][]>([])
  pictures.current = basemaps.map((b) => b.meta)
  const [inView, setInView] = useState<string[]>([])
  const satellite = layer === 'satellite' && basemaps.length > 0

  useEffect(() => {
    if (!el.current) return
    const map = new maplibregl.Map({ container: el.current, style: STYLE, center: [-84.02, 10.42], zoom: 13, attributionControl: false })
    mapRef.current = map
    const onMove = () => {
      setScale(scaleFor(map))
      const v = map.getBounds()
      const seen = pictures.current
        .filter((p) => p.bounds.lonMin < v.getEast() && p.bounds.lonMax > v.getWest() && p.bounds.latMin < v.getNorth() && p.bounds.latMax > v.getSouth())
        .map((p) => p.basemapId)
      setInView((was) => (was.join() === seen.join() ? was : seen))
    }
    map.on('move', onMove)
    map.on('load', async () => {
      const card = css('--card') || '#fff'
      const marks: [string, string, string][] = [
        ['m-on', css('--on-mark'), css('--on-glyph')],
        ['m-near', css('--near-mark'), css('--near-glyph')],
        ['m-off', css('--off-mark'), css('--off-glyph')],
        ['m-outside', css('--off-mark'), card],
        ['m-typed', css('--ink-2'), card],
      ]
      for (const [name, color, glyph] of marks) {
        try {
          map.addImage(name, await markImage(SYMBOLS[name]!, color, glyph, card), { pixelRatio: 2 })
          map.addImage(`${name}-sat`, await markImage(SYMBOLS[name]!, color, glyph, card, card), { pixelRatio: 2 })
        } catch {
          /* a marker that can't draw still shows in the queue and detail */
        }
      }
      const empty = { type: 'FeatureCollection', features: [] } as GeoJSON.FeatureCollection
      for (const id of ['transects', 'links', 'originals', 'points']) map.addSource(id, { type: 'geojson', data: empty })
      map.addLayer({
        id: 'transect-edge',
        type: 'line',
        source: 'transects',
        paint: { 'line-color': card, 'line-opacity': 0.9, 'line-width': ['case', ['get', 'active'], 7, 6] },
        layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
      })
      map.addLayer({
        id: 'transect-line',
        type: 'line',
        source: 'transects',
        paint: { 'line-color': css('--transect'), 'line-width': ['case', ['get', 'active'], 4, 3] },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      })
      map.addLayer({ id: 'links-edge', type: 'line', source: 'links', paint: { 'line-color': card, 'line-width': 4, 'line-dasharray': [1.0125, 1.0125] }, layout: { visibility: 'none' } })
      map.addLayer({ id: 'links', type: 'line', source: 'links', paint: { 'line-color': css('--ink-2'), 'line-width': 1.5, 'line-dasharray': [2.7, 2.7] } })
      map.addLayer({ id: 'originals', type: 'symbol', source: 'originals', layout: { 'icon-image': 'm-typed', 'icon-allow-overlap': true, 'icon-ignore-placement': true } })
      map.addLayer({
        id: 'approved-ring',
        type: 'circle',
        source: 'points',
        filter: ['==', ['get', 'approved'], true],
        paint: { 'circle-radius': 12.5, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': css('--on-mark'), 'circle-stroke-width': 1.75 },
      })
      map.addLayer({
        id: 'points',
        type: 'symbol',
        source: 'points',
        layout: { 'icon-image': ['get', 'icon'], 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'symbol-sort-key': ['get', 'sort'] },
        paint: { 'icon-opacity': ['case', ['get', 'rejected'], 0.4, 1] },
      })
      map.addLayer({
        id: 'selected-edge',
        type: 'circle',
        source: 'points',
        filter: ['==', ['get', 'selected'], true],
        paint: { 'circle-radius': 14, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': card, 'circle-stroke-width': 5 },
        layout: { visibility: 'none' },
      })
      map.addLayer({
        id: 'selected-ring',
        type: 'circle',
        source: 'points',
        filter: ['==', ['get', 'selected'], true],
        paint: { 'circle-radius': 14, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': css('--ink'), 'circle-stroke-width': 2 },
      })
      map.on('click', 'points', (e: MapLayerMouseEvent) => {
        const key = e.features?.[0]?.properties?.key
        if (key) onSelectRef.current(String(key))
      })
      map.on('mouseenter', 'points', () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', 'points', () => (map.getCanvas().style.cursor = ''))
      onMove()
      setReady(true)
    })
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(el.current)
    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [])

  const selected = records.find((r) => r.key === selectedKey)
  const activeTransect = selected?.transectId

  // The satellite pictures: one image source each (a blob URL, so nothing is fetched), drawn under every line.
  // Greyed down so the picture stays background and the green "On the line" marks don't sit on bright green.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !basemaps.length) return
    const added: { id: string; url: string }[] = []
    for (const b of basemaps) {
      const id = `picture-${b.basemapId}`
      const url = URL.createObjectURL(new Blob([b.bytes as BlobPart], { type: 'image/jpeg' }))
      const coordinates = corners(b.meta.bounds)
      const had = map.getSource(id) as ImageSource | undefined
      if (had) had.updateImage({ url, coordinates })
      else {
        map.addSource(id, { type: 'image', url, coordinates })
        map.addLayer(
          { id, type: 'raster', source: id, paint: { 'raster-fade-duration': 0, 'raster-saturation': -0.65, 'raster-contrast': -0.2, 'raster-brightness-min': 0.08 }, layout: { visibility: satellite ? 'visible' : 'none' } },
          'transect-edge',
        )
      }
      added.push({ id, url })
    }
    map.fire('move')
    return () => {
      const m = mapRef.current
      for (const a of added) {
        try {
          if (m?.getLayer(a.id)) m.removeLayer(a.id)
          if (m?.getSource(a.id)) m.removeSource(a.id)
        } catch {
          /* the map is already gone */
        }
        URL.revokeObjectURL(a.url)
      }
    }
  }, [ready, basemaps]) // eslint-disable-line react-hooks/exhaustive-deps

  // Satellite / Plain: show or hide the pictures, the white edges, and swap to the edged marks.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const vis = satellite ? 'visible' : 'none'
    for (const b of basemaps) if (map.getLayer(`picture-${b.basemapId}`)) map.setLayoutProperty(`picture-${b.basemapId}`, 'visibility', vis)
    for (const id of SAT_ONLY) map.setLayoutProperty(id, 'visibility', vis)
    map.setLayoutProperty('points', 'icon-image', satellite ? ['concat', ['get', 'icon'], '-sat'] : ['get', 'icon'])
    map.setLayoutProperty('originals', 'icon-image', satellite ? 'm-typed-sat' : 'm-typed')
  }, [ready, satellite, basemaps])

  // Transect lines, each with its ID at its start (HTML labels: no font tiles needed offline).
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: (transects?.features ?? []).map((f) => ({ ...f, properties: { ...f.properties, active: f.properties.transectId === activeTransect } })),
    }
    ;(map.getSource('transects') as GeoJSONSource).setData(fc)
    labels.current.forEach((m) => m.remove())
    labels.current = (transects?.features ?? []).map((f) => {
      const div = document.createElement('div')
      div.className = 'hq-m-lbl'
      div.textContent = f.properties.transectId
      const end = f.geometry.coordinates[f.geometry.coordinates.length - 1] as [number, number]
      return new maplibregl.Marker({ element: div, anchor: 'left', offset: [10, 0] }).setLngLat(end).addTo(map)
    })
    const used = new Set(records.map((r) => r.transectId))
    const frame = (transects?.features ?? []).filter((f) => !used.size || used.has(f.properties.transectId))
    const key = frame.map((f) => f.properties.transectId).join(',')
    if (frame.length && key !== fittedOn.current) {
      const b = new maplibregl.LngLatBounds()
      for (const f of frame) for (const c of f.geometry.coordinates) b.extend(c as [number, number])
      // Clear the team card (top left), the switch and scale (top right) and the legend (bottom).
      map.fitBounds(b, { padding: { top: 110, left: 250, bottom: 130, right: 90 }, duration: 0, maxZoom: 15.5 })
      fittedOn.current = key
    }
  }, [ready, transects, activeTransect, records])

  // Points, rings, and the point as typed before a "did you mean?" fix.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const enc = records.filter((r) => r.recordType === 'encounter')
    const points: GeoJSON.Feature[] = enc.map((r) => {
      const e = r.data as Encounter
      const band = BAND_OF[r.hq?.coord?.band ?? e.location.check.band] ?? 'on'
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [e.location.lon, e.location.lat] },
        properties: { key: r.key, icon: `m-${band}`, sort: r.key === selectedKey ? 10 : r.flagged ? 5 : 1, approved: r.status === 'approved', rejected: r.status === 'rejected', selected: r.key === selectedKey },
      }
    })
    const originals: GeoJSON.Feature[] = []
    const links: GeoJSON.Feature[] = []
    for (const r of enc) {
      const e = r.data as Encounter
      if (!e.location.original) continue
      const o = e.location.original
      originals.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [o.lon, o.lat] }, properties: { key: r.key } })
      links.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[o.lon, o.lat], [e.location.lon, e.location.lat]] }, properties: {} })
    }
    ;(map.getSource('points') as GeoJSONSource).setData({ type: 'FeatureCollection', features: points })
    ;(map.getSource('originals') as GeoJSONSource).setData({ type: 'FeatureCollection', features: originals })
    ;(map.getSource('links') as GeoJSONSource).setData({ type: 'FeatureCollection', features: links })

    // Plain-words notes beside the selected record's fix: "as typed · Off the line" and "fixed in field".
    notes.current.forEach((m) => m.remove())
    notes.current = []
    const sel = enc.find((r) => r.key === selectedKey)
    const se = sel?.data as Encounter | undefined
    if (sel && se?.location.original) {
      const c = se.location.check
      const note = (html: string, at: [number, number]) => {
        const div = document.createElement('div')
        div.className = 'hq-m-note'
        div.innerHTML = html
        notes.current.push(new maplibregl.Marker({ element: div, anchor: 'left', offset: [16, 0] }).setLngLat(at).addTo(map))
      }
      const mark = (b: string) => `<svg class="fk-mark fk-mark--${b} fk-mark--14" aria-hidden="true"><use href="#m-${b}"/></svg>`
      note(`<b>as typed</b><span>${mark('off')} Off the line · ${fmtNumber(c.offsetM, 0)} m off ${c.transectId}</span>`, [se.location.original.lon, se.location.original.lat])
      const now = sel.hq?.coord
      note(`<b>fixed in field</b><span>${now ? `${mark('on')} ${fmtNumber(now.offsetM, 1)} m from the line` : 'suggestion used'}</span>`, [se.location.lon, se.location.lat])
    }
  }, [ready, records, selectedKey])

  // Bring the selected record into view (both ends of a fixed coordinate).
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !selected) return
    if (selected.recordType === 'survey') {
      const t = transects?.features.find((f) => f.properties.transectId === selected.transectId)
      if (t) {
        const b = new maplibregl.LngLatBounds()
        for (const c of t.geometry.coordinates) b.extend(c as [number, number])
        map.fitBounds(b, { padding: 100, duration: 400, maxZoom: 16 })
      }
      return
    }
    const e = selected.data as Encounter
    const pts: [number, number][] = [[e.location.lon, e.location.lat]]
    if (e.location.original) pts.push([e.location.original.lon, e.location.original.lat])
    const bounds = map.getBounds()
    if (pts.every((p) => bounds.contains(p))) return
    const b = new maplibregl.LngLatBounds()
    pts.forEach((p) => b.extend(p))
    map.fitBounds(b, { padding: 120, duration: 400, maxZoom: 15 })
  }, [ready, selectedKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // The licence credit (CC BY 4.0), in the map's corner whenever a picture is on screen.
  const credits = [...new Set(basemaps.filter((b) => inView.includes(b.basemapId)).map((b) => b.meta.attribution))]

  return (
    <div className={`fk-card fk-map hq-map${basemaps.length ? ' hq-map--layers' : ''}`}>
      <div ref={el} className="hq-map__gl" />
      <div className="hq-map__tr">
        <div className="fk-scale" aria-label={`Scale: ${scale.metres} m`}>
          <span>{scale.metres >= 1000 ? `${scale.metres / 1000} km` : `${scale.metres} m`}</span>
          <i style={{ width: scale.px }} />
        </div>
        {basemaps.length > 0 && (
          <div
            className="fk-seg fk-seg--sm hq-map__layers"
            role="radiogroup"
            aria-label="Under the lines"
            onKeyDown={(e) => {
              if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
              e.preventDefault()
              e.stopPropagation()
              const next = layer === 'satellite' ? 'plain' : 'satellite'
              onLayer(next)
              e.currentTarget.querySelector<HTMLButtonElement>(`[data-layer="${next}"]`)?.focus()
            }}
          >
            {(['satellite', 'plain'] as const).map((l) => (
              <button key={l} type="button" role="radio" data-layer={l} aria-checked={layer === l} tabIndex={layer === l ? 0 : -1} onClick={() => onLayer(l)}>
                {l === 'satellite' ? 'Satellite' : 'Plain'}
              </button>
            ))}
          </div>
        )}
      </div>
      {counter && (
        <div className="fk-map__counter fk-group">
          <h4 className="fk-gt">{counter.team}</h4>
          <div className="fk-counter fk-counter--sm">
            <p className="fk-counter__main">{counter.line}</p>
            {counter.sub && (
              <p className="fk-counter__sub">
                <Icon name="clock" />
                {counter.sub}
              </p>
            )}
          </div>
        </div>
      )}
      <div className="fk-zoom">
        <button aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()}>
          <Icon name="plus" />
        </button>
        <button aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()}>
          <Icon name="minus" />
        </button>
      </div>
      <div className="hq-map__foot">
        <div className="fk-legend" aria-label="Map key">
          <span>
            <Mark band="on" />
            On the line
          </span>
          <span>
            <Mark band="near" />
            Near the line
          </span>
          <span>
            <Mark band="off" />
            Off the line
          </span>
          <span>
            <Mark band="outside" />
            Outside the project area
          </span>
          <span>
            <Mark band="typed" />
            Typed before a fix
          </span>
          <span>
            <Mark band="ring" />
            Green ring = approved
          </span>
          <span>
            <svg className="fk-mark" viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="10" cy="10" r="8" fill="none" stroke="var(--ink)" strokeWidth="2" />
            </svg>
            Black ring = selected
          </span>
        </div>
        {basemaps.length > 0 && (
          // Always laid out, hidden when no picture is on screen, so the legend doesn't jump when you switch.
          <p className="hq-map__credit" style={{ visibility: satellite && credits.length ? 'visible' : 'hidden' }}>
            {(credits.length ? credits : [basemaps[0]!.meta.attribution]).join(' · ')}
          </p>
        )}
      </div>
    </div>
  )
}
