// All teams' points over the transect lines. Plain background, no basemap tiles: safe with no internet.
// Markers carry shape as well as colour (colour-blind safe): circle = on the line, triangle = near, diamond = far.

import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, MapLayerMouseEvent, StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre 6 runs its worker from a separate file: serve it ourselves so it is precached for offline use.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

maplibregl.setWorkerUrl(workerUrl)
import type { Encounter, ReviewStatus, TransectCollection } from '@sciworks/shared'
import type { RecordRow } from '../db'

type Band = 'green' | 'amber' | 'red' | 'outside-bbox' | 'unknown'

const BAND_FILL: Record<Band, string> = {
  green: '#2f7d4f',
  amber: '#c98a12',
  red: '#b83a2e',
  'outside-bbox': '#6b3fa0',
  unknown: '#6f6f6f',
}
const STATUSES: ReviewStatus[] = ['received', 'flagged', 'edited', 'approved', 'rejected']

/** Draws one marker icon: the shape says the band, the ring says the review status. */
function drawIcon(band: Band, status: ReviewStatus, selected: boolean): ImageData {
  const px = 2
  const size = 30 * px
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const mid = size / 2
  const r = (selected ? 10 : 8) * px
  g.beginPath()
  if (band === 'green' || band === 'unknown') g.arc(mid, mid, r, 0, Math.PI * 2)
  else if (band === 'amber') {
    g.moveTo(mid, mid - r * 1.15)
    g.lineTo(mid + r * 1.1, mid + r * 0.8)
    g.lineTo(mid - r * 1.1, mid + r * 0.8)
    g.closePath()
  } else {
    g.moveTo(mid, mid - r * 1.2)
    g.lineTo(mid + r * 1.2, mid)
    g.lineTo(mid, mid + r * 1.2)
    g.lineTo(mid - r * 1.2, mid)
    g.closePath()
  }
  g.fillStyle = status === 'rejected' ? '#bdbdbd' : BAND_FILL[band]
  g.fill()
  g.lineWidth = (status === 'approved' ? 3.5 : selected ? 3 : 1.5) * px
  g.strokeStyle = status === 'approved' ? '#10251a' : selected ? '#111' : '#ffffff'
  g.stroke()
  g.fillStyle = '#fff'
  g.font = `bold ${9 * px}px system-ui, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const glyph = status === 'approved' ? '✓' : status === 'rejected' ? '✕' : status === 'edited' ? '✎' : status === 'flagged' ? '!' : ''
  if (glyph) g.fillText(glyph, mid, mid + px)
  return g.getImageData(0, 0, size, size)
}

const STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#eceee7' } }],
}

const bandOf = (row: RecordRow): Band => (row.hq?.coord?.band as Band | undefined) ?? (row.hq?.transectMissing ? 'unknown' : 'unknown')

export interface MapViewProps {
  transects?: TransectCollection
  records: RecordRow[]
  selectedKey?: string
  onSelect: (key: string) => void
}

export function MapView({ transects, records, selectedKey, onSelect }: MapViewProps) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [ready, setReady] = useState(false)
  const fitted = useRef(false)
  const labels = useRef<maplibregl.Marker[]>([])
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    if (!el.current) return
    const map = new maplibregl.Map({ container: el.current, style: STYLE, center: [-84.02, 10.42], zoom: 13, attributionControl: false })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')
    mapRef.current = map
    map.on('load', () => {
      for (const band of Object.keys(BAND_FILL) as Band[]) {
        for (const status of STATUSES) {
          map.addImage(`pt-${band}-${status}`, drawIcon(band, status, false), { pixelRatio: 2 })
          map.addImage(`pt-${band}-${status}-sel`, drawIcon(band, status, true), { pixelRatio: 2 })
        }
      }
      const empty = { type: 'FeatureCollection', features: [] } as GeoJSON.FeatureCollection
      map.addSource('transects', { type: 'geojson', data: empty })
      map.addSource('links', { type: 'geojson', data: empty })
      map.addSource('originals', { type: 'geojson', data: empty })
      map.addSource('points', { type: 'geojson', data: empty })
      map.addLayer({ id: 'transect-casing', type: 'line', source: 'transects', paint: { 'line-color': '#ffffff', 'line-width': 7 }, layout: { 'line-cap': 'round', 'line-join': 'round' } })
      map.addLayer({
        id: 'transect-line',
        type: 'line',
        source: 'transects',
        paint: { 'line-color': '#34413a', 'line-width': ['case', ['get', 'active'], 4, 2.5] },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      })
      map.addLayer({ id: 'links', type: 'line', source: 'links', paint: { 'line-color': '#7a4b2a', 'line-width': 1.5, 'line-dasharray': [2, 2] } })
      map.addLayer({ id: 'originals', type: 'circle', source: 'originals', paint: { 'circle-radius': 6, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#7a4b2a', 'circle-stroke-width': 2 } })
      map.addLayer({
        id: 'points',
        type: 'symbol',
        source: 'points',
        layout: { 'icon-image': ['get', 'icon'], 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'symbol-sort-key': ['get', 'sort'] },
      })
      map.on('click', 'points', (e: MapLayerMouseEvent) => {
        const key = e.features?.[0]?.properties?.key
        if (key) onSelectRef.current(String(key))
      })
      map.on('mouseenter', 'points', () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', 'points', () => (map.getCanvas().style.cursor = ''))
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

  // Transect lines, with an HTML label at each start (no font tiles needed offline).
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
      div.className = 'map-label'
      div.textContent = f.properties.transectId
      const start = f.geometry.coordinates[0] as [number, number]
      return new maplibregl.Marker({ element: div, anchor: 'right', offset: [-8, 0] }).setLngLat(start).addTo(map)
    })
    if (!fitted.current && transects?.features.length) {
      const b = new maplibregl.LngLatBounds()
      for (const f of transects.features) for (const c of f.geometry.coordinates) b.extend(c as [number, number])
      map.fitBounds(b, { padding: 60, duration: 0 })
      fitted.current = true
    }
  }, [ready, transects, activeTransect])

  // Points: current accepted positions; and, where a "did you mean?" fix was accepted, the original typed point.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const enc = records.filter((r) => r.recordType === 'encounter')
    const points: GeoJSON.Feature[] = enc.map((r) => {
      const e = r.data as Encounter
      const sel = r.key === selectedKey
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [e.location.lon, e.location.lat] },
        properties: { key: r.key, icon: `pt-${bandOf(r)}-${r.status}${sel ? '-sel' : ''}`, sort: sel ? 10 : r.flagged ? 5 : 1 },
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
        map.fitBounds(b, { padding: 80, duration: 400, maxZoom: 16 })
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
    map.fitBounds(b, { padding: 100, duration: 400, maxZoom: 15 })
  }, [ready, selectedKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="map-wrap">
      <div ref={el} className="map" />
      <div className="map-legend" aria-label="Map key">
        <span><b className="lg lg-green">●</b> on the line</span>
        <span><b className="lg lg-amber">▲</b> near (check)</span>
        <span><b className="lg lg-red">◆</b> far off</span>
        <span><b className="lg lg-orig">○</b> typed before a fix</span>
        <span>ring = approved ✓</span>
      </div>
    </div>
  )
}
