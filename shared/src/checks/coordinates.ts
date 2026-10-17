// Coordinate check against the pre-mapped transect line, plus the "did you mean?" fixer (SHARED-CONTRACT §8).
// Automates Susie's paper check: a point typed with one wrong digit lands far off the line.
// It NEVER changes the input. It only measures and suggests; a person decides.

import { point } from '@turf/helpers';
import { nearestPointOnLine } from '@turf/nearest-point-on-line';
import proj4 from 'proj4';
import type {
  BBox,
  CoordBand,
  CoordCheck,
  CoordFlag,
  CoordFormat,
  CoordSuggestion,
  Project,
  SuggestionKind,
  Transect,
  Uuid,
} from '../types';

export const COORD_CHECKER_VERSION = 'coord-check@1.0.0';

export type Grid = 'utm16n' | 'utm17n' | 'crtm05';

/** proj4 definitions. CRTM05 = EPSG:5367 (CR05 / CRTM05), copied from epsg.io/5367.proj4 on 17 Oct 2026. */
export const GRID_DEFS: Record<Grid, string> = {
  utm16n: '+proj=utm +zone=16 +datum=WGS84 +units=m +no_defs',
  utm17n: '+proj=utm +zone=17 +datum=WGS84 +units=m +no_defs',
  crtm05:
    '+proj=tmerc +lat_0=0 +lon_0=-84 +k=0.9999 +x_0=500000 +y_0=0 +ellps=WGS84 +towgs84=-0.16959,0.35312,0.51846,-0.03385,0.16325,-0.03446,0.03693 +units=m +no_defs',
};

export const FORMAT_LABELS: Record<CoordFormat, string> = {
  dd: 'decimal degrees',
  dm: 'degrees and decimal minutes',
  dms: 'degrees, minutes and seconds',
  utm16n: 'UTM zone 16N',
  utm17n: 'UTM zone 17N',
  crtm05: 'CRTM05 (Costa Rica national grid)',
};

const isGrid = (f: CoordFormat): f is Grid => f === 'utm16n' || f === 'utm17n' || f === 'crtm05';

export function gridToLatLon(grid: Grid, easting: number, northing: number): { lat: number; lon: number } {
  const [lon, lat] = proj4(GRID_DEFS[grid], 'WGS84', [easting, northing]);
  return { lat, lon };
}

export function latLonToGrid(grid: Grid, lat: number, lon: number): { easting: number; northing: number } {
  const [easting, northing] = proj4('WGS84', GRID_DEFS[grid], [lon, lat]);
  return { easting, northing };
}

// ---------- parsing what was typed ----------

interface NumToken {
  text: string;
  start: number;
  value: number;
}

const TOKEN_NAMES: Record<CoordFormat, string[]> = {
  dd: ['latitude', 'longitude'],
  dm: ['latitude degrees', 'latitude minutes', 'longitude degrees', 'longitude minutes'],
  dms: [
    'latitude degrees', 'latitude minutes', 'latitude seconds',
    'longitude degrees', 'longitude minutes', 'longitude seconds',
  ],
  utm16n: ['easting', 'northing'],
  utm17n: ['easting', 'northing'],
  crtm05: ['easting', 'northing'],
};

/** Finds the numbers that make up a coordinate in the typed string, with their positions. */
function numberTokens(raw: string, format: CoordFormat): NumToken[] {
  // A decimal comma ("10,4321") is only read as a decimal point when the string has no '.' at all,
  // and never in grid numbers, where a comma can only be a separator.
  const decimalComma = !raw.includes('.') && !isGrid(format);
  const re = decimalComma ? /[-+]?\d+(?:,\d+)?/g : /[-+]?\d+(?:\.\d+)?/g;
  let tokens: NumToken[] = [];
  for (const m of raw.matchAll(re)) {
    const text = m[0];
    tokens.push({ text, start: m.index ?? 0, value: Number(text.replace(',', '.')) });
  }
  if (isGrid(format)) tokens = tokens.filter((t) => Math.abs(t.value) >= 1000); // drops a Garmin zone label like "16P"
  return tokens;
}

function hemisphereSigns(raw: string): { lat?: 1 | -1; lon?: 1 | -1 } {
  const letters = raw.toUpperCase().replace(/[^NSEWO]/g, '');
  const out: { lat?: 1 | -1; lon?: 1 | -1 } = {};
  if (letters.includes('S')) out.lat = -1;
  else if (letters.includes('N')) out.lat = 1;
  if (letters.includes('W') || letters.includes('O')) out.lon = -1; // O = oeste
  else if (letters.includes('E')) out.lon = 1;
  return out;
}

const signed = (value: number, sign?: 1 | -1) => (sign === undefined ? value : sign * Math.abs(value));

/** Turns a typed coordinate into WGS84 lat/lon. Accepts N/S/E/W(O) letters, minus signs and a Garmin zone label. */
export function parseTyped(raw: string, format: CoordFormat): { lat: number; lon: number } | { error: string } {
  const tokens = numberTokens(raw, format);
  const need = TOKEN_NAMES[format].length;
  if (tokens.length !== need) {
    return { error: `Expected ${need} numbers for ${FORMAT_LABELS[format]}, found ${tokens.length}.` };
  }
  const n = tokens.map((t) => t.value);

  if (isGrid(format)) {
    const [easting, northing] = n as [number, number];
    const { lat, lon } = gridToLatLon(format, easting, northing);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { error: 'Those grid numbers do not convert to a place.' };
    return { lat, lon };
  }

  const hemi = hemisphereSigns(raw);
  const fromParts = (deg: number, min = 0, sec = 0) => {
    const sign = deg < 0 || Object.is(deg, -0) ? -1 : 1;
    return sign * (Math.abs(deg) + min / 60 + sec / 3600);
  };

  let lat: number;
  let lon: number;
  if (format === 'dd') {
    [lat, lon] = n as [number, number];
  } else if (format === 'dm') {
    const [ad, am, od, om] = n as [number, number, number, number];
    if (am >= 60 || om >= 60) return { error: 'Minutes must be under 60.' };
    lat = fromParts(ad, am);
    lon = fromParts(od, om);
  } else {
    const [ad, am, as, od, om, os] = n as [number, number, number, number, number, number];
    if (am >= 60 || om >= 60 || as >= 60 || os >= 60) return { error: 'Minutes and seconds must be under 60.' };
    lat = fromParts(ad, am, as);
    lon = fromParts(od, om, os);
  }
  lat = signed(lat, hemi.lat);
  lon = signed(lon, hemi.lon);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return { error: 'Latitude must be within ±90 and longitude within ±180.' };
  return { lat, lon };
}

// ---------- measuring ----------

export function inBBox(p: { lat: number; lon: number }, b: BBox): boolean {
  return p.lat >= b.latMin && p.lat <= b.latMax && p.lon >= b.lonMin && p.lon <= b.lonMax;
}

/** Perpendicular distance from the line and distance along it, in metres. */
export function measureAgainstTransect(lat: number, lon: number, transect: Transect): { offsetM: number; chainageM: number; nearest: { lat: number; lon: number } } {
  const np = nearestPointOnLine(transect, point([lon, lat]), { units: 'meters' });
  const props = np.properties as Record<string, number>;
  const [nlon, nlat] = np.geometry.coordinates as [number, number];
  return {
    offsetM: props.pointDistance ?? props.dist ?? 0,
    chainageM: props.totalDistance ?? props.location ?? 0,
    nearest: { lat: nlat, lon: nlon },
  };
}

export function toleranceFor(transect: Transect, project: Project, accuracyM?: number): number {
  const cfg = project.coordCheck;
  const base = cfg.baseToleranceM[transect.properties.habitat] ?? cfg.baseToleranceM.canopy;
  return Math.max(base, cfg.accuracyMultiplier * (accuracyM ?? 0));
}

function bandFor(offsetM: number, toleranceM: number, amberMultiplier: number): CoordBand {
  if (offsetM <= toleranceM) return 'green';
  if (offsetM <= amberMultiplier * toleranceM) return 'amber';
  return 'red';
}

function metresBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371008.8;
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ---------- the check ----------

export interface CoordCheckInput {
  lat: number;
  lon: number;
  accuracyM?: number;
  typed?: { raw: string; format: CoordFormat };
  /** Distance along the transect as typed by the surveyor, if they typed one. */
  typedDistanceM?: number;
  /** Chainage of the previous animal on this walk, for the order check. */
  previousChainageM?: number;
}

export function checkCoordinate(input: CoordCheckInput, transect: Transect, project: Project): CoordCheck {
  const toleranceM = toleranceFor(transect, project, input.accuracyM);
  const { offsetM, chainageM } = measureAgainstTransect(input.lat, input.lon, transect);
  const flags: CoordFlag[] = [];
  let band: CoordBand;

  if (!inBBox(input, project.bbox)) {
    band = 'outside-bbox';
    flags.push('OUTSIDE_PROJECT_BBOX');
    if (inBBox({ lat: input.lat, lon: -input.lon }, project.bbox)) flags.push('PRESUMED_NEGATED_LONGITUDE');
    if (inBBox({ lat: input.lon, lon: input.lat }, project.bbox)) flags.push('PRESUMED_SWAPPED_COORDINATE');
  } else {
    band = bandFor(offsetM, toleranceM, project.coordCheck.amberMultiplier);
    if (band === 'amber') flags.push('OFF_TRANSECT_AMBER');
    if (band === 'red') flags.push('OFF_TRANSECT_RED');
  }

  if (input.typedDistanceM !== undefined && Math.abs(chainageM - input.typedDistanceM) > toleranceM) {
    flags.push('TYPED_DISTANCE_DISAGREES');
  }
  if (
    transect.properties.direction === 'start-to-end' &&
    input.previousChainageM !== undefined &&
    (band === 'green' || band === 'amber') &&
    chainageM < input.previousChainageM - toleranceM
  ) {
    flags.push('ORDER_REVERSED');
  }

  const suggestions = band === 'green' ? [] : suggestFixes(input, transect, project, toleranceM);

  return {
    checkerVersion: COORD_CHECKER_VERSION,
    transectId: transect.properties.transectId,
    offsetM: round1(offsetM),
    chainageM: round1(chainageM),
    toleranceM: round1(toleranceM),
    band,
    flags,
    suggestions,
  };
}

const round1 = (x: number) => Math.round(x * 10) / 10;

// ---------- "did you mean?" ----------

interface Candidate {
  kind: SuggestionKind;
  lat: number;
  lon: number;
  explain: string;
  raw?: string;
  /** 0 = whole-number mistakes (swaps, signs, grids), 1 = a single wrong digit. Lower is offered first. */
  tier: 0 | 1;
}

const ORDINALS = ['1st', '2nd', '3rd'];
const ordinal = (n: number) => ORDINALS[n - 1] ?? `${n}th`;

function digitPositions(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) if (text[i]! >= '0' && text[i]! <= '9') out.push(i);
  return out;
}

function replaceAt(s: string, index: number, replacement: string): string {
  return s.slice(0, index) + replacement + s.slice(index + replacement.length);
}

/** Every plausible single mistake, kept only if it lands within tolerance of the line. Best first. */
export function suggestFixes(input: CoordCheckInput, transect: Transect, project: Project, toleranceM: number): CoordSuggestion[] {
  const cands: Candidate[] = [];
  const { lat, lon } = input;

  cands.push({
    kind: 'negated-lon',
    lat,
    lon: -lon,
    tier: 0,
    explain: lon > 0 ? 'Add the minus sign to the longitude (west of Greenwich is negative).' : 'Flip the sign of the longitude.',
  });
  if (Math.abs(lon) <= 90) {
    cands.push({ kind: 'lat-lon-swap', lat: lon, lon: lat, tier: 0, explain: 'Latitude and longitude look swapped.' });
  }

  const typed = input.typed;
  if (typed) {
    const { raw, format } = typed;
    const names = TOKEN_NAMES[format];
    const tokens = numberTokens(raw, format);

    if (format === 'dd') {
      const dmAsDd = (v: number) => {
        const sign = v < 0 ? -1 : 1;
        const a = Math.abs(v);
        const deg = Math.trunc(a);
        const fracDigits = (String(a).split('.')[1] ?? '').padEnd(2, '0');
        const minutes = Number(`${fracDigits.slice(0, 2)}.${fracDigits.slice(2) || '0'}`);
        return minutes < 60 ? sign * (deg + minutes / 60) : undefined;
      };
      const dLat = dmAsDd(lat);
      const dLon = dmAsDd(lon);
      const say = 'It looks like degrees and minutes were typed as decimal degrees';
      if (dLat !== undefined && dLon !== undefined) cands.push({ kind: 'dm-as-dd', lat: dLat, lon: dLon, tier: 0, explain: `${say} (both numbers).` });
      if (dLat !== undefined) cands.push({ kind: 'dm-as-dd', lat: dLat, lon, tier: 0, explain: `${say} (latitude).` });
      if (dLon !== undefined) cands.push({ kind: 'dm-as-dd', lat, lon: dLon, tier: 0, explain: `${say} (longitude).` });
    }

    if (isGrid(format) && tokens.length === 2) {
      const [e, n] = [tokens[0]!.value, tokens[1]!.value];
      for (const g of project.coordCheck.grids) {
        if (!isGrid(g) || g === format) continue;
        const p = gridToLatLon(g, e, n);
        cands.push({
          kind: g,
          ...p,
          tier: 0,
          explain: `Read these numbers as ${FORMAT_LABELS[g]}, not ${FORMAT_LABELS[format]}. The GPS may be set to a different grid.`,
        });
      }
      const swapped = gridToLatLon(format, n, e);
      cands.push({ kind: 'lat-lon-swap', ...swapped, tier: 0, explain: 'Easting and northing look swapped.' });
    }

    // One slip of the finger: two neighbouring digits swapped, or one digit wrong.
    tokens.forEach((tok, ti) => {
      const name = names[ti] ?? 'number';
      const digits = digitPositions(tok.text);
      for (let k = 0; k + 1 < digits.length; k++) {
        const i = digits[k]!;
        const j = digits[k + 1]!;
        if (j !== i + 1 || tok.text[i] === tok.text[j]) continue;
        const newTok = replaceAt(tok.text, i, tok.text[j]! + tok.text[i]!);
        const newRaw = raw.slice(0, tok.start) + newTok + raw.slice(tok.start + tok.text.length);
        const p = parseTyped(newRaw, format);
        if ('error' in p) continue;
        cands.push({
          kind: 'digit-swap',
          ...p,
          raw: newRaw,
          tier: 0,
          explain: `Swap the ${ordinal(k + 1)} and ${ordinal(k + 2)} digits of the ${name} (${tok.text} → ${newTok}).`,
        });
      }
      digits.forEach((i, k) => {
        for (let d = 0; d <= 9; d++) {
          const ch = String(d);
          if (ch === tok.text[i]) continue;
          const newTok = replaceAt(tok.text, i, ch);
          const newRaw = raw.slice(0, tok.start) + newTok + raw.slice(tok.start + tok.text.length);
          const p = parseTyped(newRaw, format);
          if ('error' in p) continue;
          cands.push({
            kind: 'digit-edit',
            ...p,
            raw: newRaw,
            tier: 1,
            explain: `Change the ${ordinal(k + 1)} digit of the ${name} from ${tok.text[i]} to ${ch} (${tok.text} → ${newTok}).`,
          });
        }
      });
    });
  }

  const kept: (CoordSuggestion & { tier: 0 | 1 })[] = [];
  for (const c of cands) {
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lon)) continue;
    if (!inBBox(c, project.bbox)) continue;
    if (metresBetween(c, input) < toleranceM) continue; // a fix that barely moves the point isn't a fix
    const m = measureAgainstTransect(c.lat, c.lon, transect);
    if (m.offsetM > toleranceM) continue;
    kept.push({
      kind: c.kind,
      lat: c.lat,
      lon: c.lon,
      offsetM: round1(m.offsetM),
      chainageM: round1(m.chainageM),
      explain: c.explain,
      ...(c.raw !== undefined ? { raw: c.raw } : {}),
      tier: c.tier,
    });
  }

  kept.sort((a, b) => a.tier - b.tier || a.offsetM - b.offsetM);
  const out: CoordSuggestion[] = [];
  for (const k of kept) {
    if (out.some((o) => metresBetween(o, k) < 1)) continue;
    const { tier: _tier, ...suggestion } = k;
    out.push(suggestion);
    if (out.length >= project.coordCheck.maxSuggestions) break;
  }
  return out;
}

// ---------- HQ batch check: one transect, one day ----------

/**
 * Robust outliers (modified z-score > 3.5 on the offsets, using the median absolute deviation) and a
 * datum-shift hint (every point pushed off the line in the same direction by a similar distance).
 */
export function batchCheckTransect(
  points: { id: Uuid; lat: number; lon: number; offsetM: number }[],
  transect: Transect,
): { id: Uuid; flags: CoordFlag[] }[] {
  const result = points.map((p) => ({ id: p.id, flags: [] as CoordFlag[] }));
  if (points.length < 5) return result;

  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
  };
  const offsets = points.map((p) => p.offsetM);
  const med = median(offsets);
  const mad = median(offsets.map((x) => Math.abs(x - med)));
  if (mad > 0) {
    points.forEach((p, i) => {
      if (Math.abs((0.6745 * (p.offsetM - med)) / mad) > 3.5) result[i]!.flags.push('ROBUST_OUTLIER');
    });
  }

  // Offset vectors in metres (east, north) from the nearest point on the line to each point.
  const vectors = points.map((p) => {
    const { nearest } = measureAgainstTransect(p.lat, p.lon, transect);
    const east = (p.lon - nearest.lon) * 111320 * Math.cos((p.lat * Math.PI) / 180);
    const north = (p.lat - nearest.lat) * 110540;
    return { east, north };
  });
  const meanE = vectors.reduce((s, v) => s + v.east, 0) / vectors.length;
  const meanN = vectors.reduce((s, v) => s + v.north, 0) / vectors.length;
  const meanMag = Math.hypot(meanE, meanN);
  const spread = vectors.reduce((s, v) => s + Math.hypot(v.east - meanE, v.north - meanN), 0) / vectors.length;
  if (meanMag > 50 && spread < 0.35 * meanMag) {
    result.forEach((r) => r.flags.push('POSSIBLE_DATUM_SHIFT'));
  }
  return result;
}
