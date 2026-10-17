// The north-up map frame shared by every transect preview: lon/lat → x/y in an SVG box, to scale.
// It is a plain equirectangular projection at the line's mid-latitude, so x is linear in longitude and y is
// linear in latitude. That is exactly how a basemap picture is gridded (EPSG:4326, corners = bounds), so the
// picture placed with rect(bounds) and preserveAspectRatio="none" lines up with the line and the points.
import type { BBox } from '@sciworks/shared';

const M_PER_DEG_LAT = 111_320;

export interface LonLat {
  lon: number;
  lat: number;
}

export interface MapFrame {
  width: number;
  height: number;
  /** SVG units per metre on the ground. */
  scale: number;
  px: (lon: number, lat: number) => { x: number; y: number };
  /** Where a lat/lon box sits in the frame: top-left corner (lonMin, latMax) plus width and height. */
  rect: (b: BBox) => { x: number; y: number; width: number; height: number };
}

/**
 * Fits the line, plus any `fit` points, inside a width × height box with `pad` on every side, north up.
 * Metres from the south-west corner keep the drawing to scale. With `cover` (a picture's bounds) the view then
 * slides, never zooms, so the picture fills as much of the box as it can while the line stays clear of the edges.
 */
export function makeFrame(line: [number, number][], width: number, height: number, pad: number, fit: LonLat[] = [], cover?: BBox): MapFrame {
  const lons = [...line.map(([lo]) => lo), ...fit.map((p) => p.lon)];
  const lats = [...line.map(([, la]) => la), ...fit.map((p) => p.lat)];
  const lonMin = Math.min(...lons);
  const latMin = Math.min(...lats);
  const midLat = (latMin + Math.max(...lats)) / 2;
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180);
  const spanX = Math.max((Math.max(...lons) - lonMin) * mPerDegLon, 1);
  const spanY = Math.max((Math.max(...lats) - latMin) * M_PER_DEG_LAT, 1);
  const scale = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
  let offX = (width - spanX * scale) / 2;
  let offY = (height - spanY * scale) / 2;
  if (cover) {
    const keep = pad / 2;
    // Picture edges in "metres from the south-west corner" × scale, before any slide.
    const left = offX + (cover.lonMin - lonMin) * mPerDegLon * scale;
    const right = offX + (cover.lonMax - lonMin) * mPerDegLon * scale;
    const bottom = offY + (cover.latMin - latMin) * M_PER_DEG_LAT * scale;
    const top = offY + (cover.latMax - latMin) * M_PER_DEG_LAT * scale;
    const slide = (lo: number, hi: number, size: number, contentLo: number, contentHi: number) => {
      const want = lo > 0 && hi > size ? -Math.min(lo, hi - size) : hi < size && lo < 0 ? Math.min(-lo, size - hi) : 0;
      return Math.max(keep - contentLo, Math.min(size - keep - contentHi, want));
    };
    offX += slide(left, right, width, offX, offX + spanX * scale);
    offY += slide(bottom, top, height, offY, offY + spanY * scale);
  }
  const px = (lon: number, lat: number) => ({
    x: offX + (lon - lonMin) * mPerDegLon * scale,
    y: height - (offY + (lat - latMin) * M_PER_DEG_LAT * scale),
  });
  const rect = (b: BBox) => {
    const tl = px(b.lonMin, b.latMax);
    const br = px(b.lonMax, b.latMin);
    return { x: tl.x, y: tl.y, width: br.x - tl.x, height: br.y - tl.y };
  };
  return { width, height, scale, px, rect };
}

/** Rough ground distance in metres between two points (fine at transect scale). */
export function metresBetween(a: LonLat, b: LonLat): number {
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.hypot((a.lon - b.lon) * mPerDegLon, (a.lat - b.lat) * M_PER_DEG_LAT);
}
