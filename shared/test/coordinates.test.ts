import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  batchCheckTransect, checkCoordinate, gridToLatLon, latLonToGrid, measureAgainstTransect, parseTyped,
  type Project, type Transect, type TransectCollection,
} from '../src/index';

const project = JSON.parse(readFileSync(new URL('../../demo-data/project.json', import.meta.url), 'utf8')) as Project;
const transects = JSON.parse(readFileSync(new URL('../../demo-data/transects.geojson', import.meta.url), 'utf8')) as TransectCollection;
const t2 = transects.features.find((t) => t.properties.transectId === 'T-LS-02') as Transect;
const v = t2.geometry.coordinates;
const onLine = { lat: (v[1]![1]! + v[2]![1]!) / 2, lon: (v[1]![0]! + v[2]![0]!) / 2 };
const metresEast = (p: { lat: number; lon: number }, m: number) => ({ lat: p.lat, lon: p.lon + m / (111320 * Math.cos((p.lat * Math.PI) / 180)) });

describe('parseTyped', () => {
  it('reads decimal degrees with signs, hemisphere letters and decimal commas', () => {
    expect(parseTyped('10.41472, -84.02727', 'dd')).toEqual({ lat: 10.41472, lon: -84.02727 });
    expect(parseTyped('N10.41472 W84.02727', 'dd')).toEqual({ lat: 10.41472, lon: -84.02727 });
    expect(parseTyped('10,41472 -84,02727', 'dd')).toEqual({ lat: 10.41472, lon: -84.02727 });
  });
  it('reads degrees and minutes', () => {
    const p = parseTyped("N10° 24.883' W84° 01.636'", 'dm') as { lat: number; lon: number };
    expect(p.lat).toBeCloseTo(10.41472, 4);
    expect(p.lon).toBeCloseTo(-84.02727, 4);
  });
  it('reads a Garmin UTM string and ignores the zone label', () => {
    const p = parseTyped('16P 825749 1153170', 'utm16n') as { lat: number; lon: number };
    const back = latLonToGrid('utm16n', p.lat, p.lon);
    expect(back.easting).toBeCloseTo(825749, 3);
    expect(back.northing).toBeCloseTo(1153170, 3);
  });
  it('explains what is wrong instead of guessing', () => {
    expect(parseTyped('10.4147', 'dd')).toHaveProperty('error');
    expect(parseTyped('10 75.1, -84 01.6', 'dm')).toHaveProperty('error');
  });
});

describe('checkCoordinate', () => {
  it('a point on the line is green, with distance along filled in and no suggestions', () => {
    const c = checkCoordinate({ ...onLine, accuracyM: 5 }, t2, project);
    expect(c.band).toBe('green');
    expect(c.offsetM).toBeLessThan(1);
    expect(c.chainageM).toBeGreaterThan(400);
    expect(c.suggestions).toEqual([]);
  });

  it('50 m off is amber (tolerance 30 m under canopy)', () => {
    const c = checkCoordinate({ ...metresEast(onLine, 60), accuracyM: 5 }, t2, project);
    expect(c.toleranceM).toBe(30);
    expect(c.offsetM).toBeGreaterThan(40);
    expect(c.band).toBe('amber');
    expect(c.flags).toContain('OFF_TRANSECT_AMBER');
  });

  it('poor GPS accuracy widens the tolerance to 3 × accuracy', () => {
    const c = checkCoordinate({ ...metresEast(onLine, 60), accuracyM: 25 }, t2, project);
    expect(c.toleranceM).toBe(75);
    expect(c.band).toBe('green');
  });

  it('THE DEMO: a swapped-digit northing is red ~1 km off, and the top suggestion puts it back ~6 m from the line', () => {
    const raw = '16P 825749 1151370';
    const p = parseTyped(raw, 'utm16n') as { lat: number; lon: number };
    const c = checkCoordinate({ ...p, accuracyM: 6, typed: { raw, format: 'utm16n' } }, t2, project);
    expect(c.band).toBe('red');
    expect(c.offsetM).toBeGreaterThan(900);
    expect(c.flags).toContain('OFF_TRANSECT_RED');
    const top = c.suggestions[0]!;
    expect(top.kind).toBe('digit-swap');
    expect(top.raw).toBe('16P 825749 1153170');
    expect(top.offsetM).toBeLessThan(10);
    expect(top.explain).toContain('northing');
  });

  it('never changes the input', () => {
    const input = { lat: 10.41, lon: 84.02, accuracyM: 5 };
    const copy = { ...input };
    checkCoordinate(input, t2, project);
    expect(input).toEqual(copy);
  });

  it('a missing minus sign lands outside Costa Rica and offers the negated longitude', () => {
    const raw = '10.41472, 84.02727';
    const p = parseTyped(raw, 'dd') as { lat: number; lon: number };
    const c = checkCoordinate({ ...p, accuracyM: 5, typed: { raw, format: 'dd' } }, t2, project);
    expect(c.band).toBe('outside-bbox');
    expect(c.flags).toEqual(expect.arrayContaining(['OUTSIDE_PROJECT_BBOX', 'PRESUMED_NEGATED_LONGITUDE']));
    expect(c.suggestions[0]?.kind).toBe('negated-lon');
  });

  it('a UTM 16N reading entered as 17N is found (La Selva sits on the zone line)', () => {
    const truth = { lat: 10.41472, lon: -84.02727 };
    const g = latLonToGrid('utm16n', truth.lat, truth.lon);
    const raw = `${Math.round(g.easting)} ${Math.round(g.northing)}`;
    const wrong = parseTyped(raw, 'utm17n') as { lat: number; lon: number };
    const c = checkCoordinate({ ...wrong, accuracyM: 5, typed: { raw, format: 'utm17n' } }, t2, project);
    expect(c.band).not.toBe('green');
    expect(c.suggestions.map((s) => s.kind)).toContain('utm16n');
    const back = gridToLatLon('utm16n', Math.round(g.easting), Math.round(g.northing));
    expect(back.lat).toBeCloseTo(truth.lat, 4);
  });

  it('flags a typed distance that disagrees with the GPS, and a walk going backwards', () => {
    const c = checkCoordinate({ ...onLine, accuracyM: 5, typedDistanceM: 50, previousChainageM: 1500 }, t2, project);
    expect(c.flags).toEqual(expect.arrayContaining(['TYPED_DISTANCE_DISAGREES', 'ORDER_REVERSED']));
  });
});

describe('batchCheckTransect (HQ)', () => {
  it('flags one robust outlier among normal GPS scatter', () => {
    const c = v.map(([lon, lat]) => ({ lat: lat!, lon: lon! }));
    const offsets = [4, 6, 3, 7, 5, 4, 120];
    const pts = offsets.map((o, i) => {
      const p = metresEast({ lat: (c[1]!.lat + c[2]!.lat) / 2 + i * 0.0002, lon: (c[1]!.lon + c[2]!.lon) / 2 + i * 0.00012 }, o);
      return { id: `p${i}`, ...p, offsetM: measureAgainstTransect(p.lat, p.lon, t2).offsetM };
    });
    const out = batchCheckTransect(pts, t2);
    expect(out.find((r) => r.id === 'p6')?.flags).toContain('ROBUST_OUTLIER');
    expect(out.filter((r) => r.flags.includes('ROBUST_OUTLIER'))).toHaveLength(1);
  });

  it('hints at a datum shift when every point is pushed the same way by the same amount', () => {
    const pts = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map((fr, i) => {
      const a = v[2]!, b = v[3]!;
      const p = metresEast({ lat: a[1]! + (b[1]! - a[1]!) * fr, lon: a[0]! + (b[0]! - a[0]!) * fr }, 200);
      return { id: `d${i}`, ...p, offsetM: measureAgainstTransect(p.lat, p.lon, t2).offsetM };
    });
    expect(batchCheckTransect(pts, t2).every((r) => r.flags.includes('POSSIBLE_DATUM_SHIFT'))).toBe(true);
  });
});
