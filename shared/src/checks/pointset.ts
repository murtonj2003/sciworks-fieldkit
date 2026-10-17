// Checking a set of GPS points that should sit together, such as the outline of an aguada (a forest pond)
// walked with a Garmin, one point at each bend (Susie, 17 Oct). There is no transect line to measure against,
// so each point is checked against the outline drawn through the *other* good points, with the same
// checkCoordinate and "did you mean?" used on transects. One slipped digit puts a point about 1 km away and,
// in Susie's words, makes it unusable.

import type { CoordCheck, CoordFormat, Project, Transect } from '../types';
import { checkCoordinate } from './coordinates';

export const POINT_SET_CHECKER_VERSION = 'point-set@1.0.0';

export interface PointSetPoint {
  id: string;
  /** What the sheet calls it, e.g. 'N', 'E', '1', '2'. */
  label?: string;
  lat: number;
  lon: number;
  accuracyM?: number;
  typed?: { raw: string; format: CoordFormat };
}

export interface PointSetResult {
  id: string;
  label?: string;
  /** Distance from the middle of the set (the median point), in metres. */
  fromCentreM: number;
  /** Far from all the others, judged robustly (it can't drag the middle with it). */
  outlier: boolean;
  /**
   * The point against the outline through the other good points: band, offset, and "did you mean?" fixes
   * that land back on the outline. Missing when fewer than 3 other good points exist.
   */
  check?: CoordCheck;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length === 0 ? 0 : s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

function metresBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371008.8;
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Checks every point in the order given (the walking order around the outline). `closed` (default true) joins
 * the last point back to the first, as for a pond outline; use false for a path.
 */
export function checkPointSet(
  points: PointSetPoint[],
  project: Project,
  opts: { habitat?: 'canopy' | 'open'; closed?: boolean; name?: string } = {},
): PointSetResult[] {
  const habitat = opts.habitat ?? 'canopy';
  const closed = opts.closed ?? true;
  const centre = { lat: median(points.map((p) => p.lat)), lon: median(points.map((p) => p.lon)) };
  const fromCentre = points.map((p) => metresBetween(centre, p));

  const cfg = project.coordCheck;
  const base = cfg.baseToleranceM[habitat] ?? cfg.baseToleranceM.canopy;
  const medD = median(fromCentre);
  const mad = median(fromCentre.map((d) => Math.abs(d - medD)));
  const outlier = fromCentre.map((d) => d > medD + Math.max(cfg.amberMultiplier * base, 5.19 * mad));

  // Big outlines have long gaps between bends; a bend point can sit well off the chord joining its neighbours.
  const good = points.filter((_, i) => !outlier[i]);
  const steps = good.slice(1).map((p, i) => metresBetween(good[i]!, p));
  const tolerance = Math.max(base, 0.5 * median(steps));
  const tuned: Project = { ...project, coordCheck: { ...cfg, baseToleranceM: { ...cfg.baseToleranceM, [habitat]: tolerance } } };

  return points.map((p, i) => {
    const others = points.filter((_, j) => j !== i && !outlier[j]);
    const result: PointSetResult = {
      id: p.id,
      ...(p.label !== undefined ? { label: p.label } : {}),
      fromCentreM: Math.round(fromCentre[i]! * 10) / 10,
      outlier: outlier[i]!,
    };
    if (others.length < 3) return result;

    const coords = others.map((q) => [q.lon, q.lat]);
    if (closed) coords.push(coords[0]!);
    const outline: Transect = {
      type: 'Feature',
      properties: { transectId: opts.name ?? 'point-set', name: opts.name ?? 'Point set', teamId: '', lengthM: 0, habitat, direction: 'either' },
      geometry: { type: 'LineString', coordinates: coords },
    };
    result.check = checkCoordinate(
      { lat: p.lat, lon: p.lon, ...(p.accuracyM !== undefined ? { accuracyM: p.accuracyM } : {}), ...(p.typed ? { typed: p.typed } : {}) },
      outline,
      tuned,
    );
    return result;
  });
}
