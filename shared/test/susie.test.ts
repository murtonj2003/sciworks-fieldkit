// Susie's second round (17 Oct): misheard or misspelt species names from student scribes, and aguada outline
// points that become unusable after one slip of the pen.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkPointSet, editDistance, searchTaxa, soundKey, type PointSetPoint, type Project, type SpeciesPack } from '../src/index';

const project = JSON.parse(readFileSync(new URL('../../demo-data/project.json', import.meta.url), 'utf8')) as Project;
const pack = JSON.parse(readFileSync(new URL('../../demo-data/species-pack.json', import.meta.url), 'utf8')) as SpeciesPack;
const top = (q: string) => searchTaxa(q, pack.taxa)[0];

describe('searchTaxa', () => {
  it('finds names typed correctly, half-typed or abbreviated', () => {
    expect(top('Bothrops asper')).toMatchObject({ reason: 'exact', taxon: { scientificName: 'Bothrops asper' } });
    expect(top('oxyb')?.taxon.scientificName).toBe('Oxybelis fulgidus');
    expect(top('B. asper')?.taxon.scientificName).toBe('Bothrops asper');
    expect(searchTaxa('imantodes', pack.taxa).map((m) => m.taxon.scientificName)).toEqual(['Imantodes cenchoa', 'Imantodes inornatus']);
  });

  it('forgives a misspelling', () => {
    expect(top('leptodira')).toMatchObject({ reason: 'spelling', taxon: { scientificName: 'Leptodeira ornata' } });
    expect(top('oxibelis fulgidus')?.taxon.scientificName).toBe('Oxybelis fulgidus');
    expect(top('drymobius margaritiferous')?.taxon.scientificName).toBe('Drymobius margaritiferus');
  });

  it('finds a name written the way it sounds', () => {
    expect(soundKey('kyronius')).toBe(soundKey('chironius'));
    expect(top('kyronius')).toMatchObject({ reason: 'sounds-like', taxon: { scientificName: 'Chironius grandisquamis' } });
  });

  it('matches the family only as typed, and returns nothing for nonsense or an empty box', () => {
    expect(searchTaxa('elapid', pack.taxa).map((m) => m.taxon.scientificName)).toEqual(['Micrurus alleni']);
    expect(searchTaxa('qwxz', pack.taxa)).toEqual([]);
    expect(searchTaxa('  ', pack.taxa)).toEqual([]);
  });

  it('counts a swap of neighbouring letters as one slip', () => {
    expect(editDistance('bohtrops', 'bothrops')).toBe(1);
  });
});

// The shape of Susie's aguada sheet ("Croc aguada", 26 Jul 2025): her 11 points in her order, with her slip
// at point 2 (one digit of the longitude wrong), moved to a made-up place nearby so her real site isn't
// published. Her sheet leaves off the minus sign on longitudes (west); here it's added.
const AGUADA: [string, number, number][] = [
  ['N', 18.11185, -89.55625], ['E', 18.11181, -89.55631], ['S', 18.11191, -89.55646], ['W', 18.11181, -89.55627],
  ['1', 18.1118, -89.55632], ['2', 18.11184, -89.56642], ['3', 18.11187, -89.55643], ['4', 18.11192, -89.55647],
  ['5', 18.11202, -89.55648], ['6', 18.11207, -89.55649], ['7', 18.11213, -89.55645],
];
const yucatan: Project = { ...project, bbox: { latMin: 17.5, latMax: 19.5, lonMin: -90.5, lonMax: -89 } };
const sheet: PointSetPoint[] = AGUADA.map(([label, lat, lon]) => ({
  id: label, label, lat, lon, accuracyM: 3, typed: { raw: `${lat}, ${lon}`, format: 'dd' },
}));

describe('checkPointSet', () => {
  it("flags point 2 of Susie's aguada outline as about 1 km off, and suggests the one-digit fix", () => {
    const results = checkPointSet(sheet, yucatan);
    const two = results.find((r) => r.label === '2')!;
    expect(two.outlier).toBe(true);
    expect(two.check?.band).toBe('red');
    expect(two.check!.offsetM).toBeGreaterThan(1000);
    expect(two.check!.offsetM).toBeLessThan(1100);
    expect(two.check!.suggestions).toHaveLength(1);
    expect(two.check!.suggestions[0]!.raw).toBe('18.11184, -89.55642');
    expect(two.check!.suggestions[0]!.explain).toContain('-89.56642 → -89.55642');
    expect(two.check!.suggestions[0]!.offsetM).toBeLessThan(10);
  });

  it('passes every other point of the outline', () => {
    const rest = checkPointSet(sheet, yucatan).filter((r) => r.label !== '2');
    expect(rest.every((r) => !r.outlier && r.check?.band === 'green')).toBe(true);
  });

  it('does not flag the ends of a long, thin outline', () => {
    // A 300 m × 40 m rectangle walked with a point every 25 m.
    const corner = { lat: 10.42, lon: -84.02 };
    const m = (east: number, north: number) => ({ lat: corner.lat + north / 110540, lon: corner.lon + east / (111320 * Math.cos((corner.lat * Math.PI) / 180)) });
    const ring = [
      ...Array.from({ length: 13 }, (_, i) => m(i * 25, 0)),
      ...Array.from({ length: 1 }, () => m(300, 20)),
      ...Array.from({ length: 13 }, (_, i) => m(300 - i * 25, 40)),
      m(0, 20),
    ];
    const results = checkPointSet(ring.map((p, i) => ({ id: String(i), ...p })), project);
    expect(results.every((r) => !r.outlier && r.check?.band === 'green')).toBe(true);
  });

  it('cannot judge a point with fewer than 3 others', () => {
    const results = checkPointSet(sheet.slice(0, 3), yucatan);
    expect(results.every((r) => r.check === undefined)).toBe(true);
  });
});
