// The satellite picture travels HQ → phone inside the HQ bundle (added Sat 17 Oct, additive).
import { readFileSync } from 'node:fs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readBundle, sha256Hex, type Basemap, type TransectCollection } from '../src/index';

const sample = new Uint8Array(readFileSync(new URL('../fixtures/HQ_sample.zip', import.meta.url)));
const transects = JSON.parse(readFileSync(new URL('../../demo-data/transects.geojson', import.meta.url), 'utf8')) as TransectCollection;

describe('basemaps in the HQ bundle', () => {
  it('the sample HQ bundle carries the La Selva satellite picture, checksum-verified', () => {
    const r = readBundle(sample);
    if (!r.ok) throw new Error(r.error);
    expect(r.problems).toEqual([]);
    const [b] = r.hq!.basemaps as Basemap[];
    expect(b).toMatchObject({ basemapId: 'la-selva-s2-2021', licence: 'CC BY 4.0', resolutionM: 10 });
    expect(b!.attribution).toContain('Copernicus Sentinel');
    const bytes = r.hq!.basemapFiles![b!.basemapId]!;
    expect(sha256Hex(bytes)).toBe(b!.sha256);
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]); // a JPEG
  });

  it('the picture covers every demo transect', () => {
    const r = readBundle(sample);
    if (!r.ok) throw new Error(r.error);
    const { bounds } = r.hq!.basemaps![0]!;
    for (const t of transects.features) {
      for (const [lon, lat] of t.geometry.coordinates as [number, number][]) {
        expect(lon).toBeGreaterThan(bounds.lonMin);
        expect(lon).toBeLessThan(bounds.lonMax);
        expect(lat).toBeGreaterThan(bounds.latMin);
        expect(lat).toBeLessThan(bounds.latMax);
      }
    }
  });

  it('a damaged picture is skipped and named; everything else still reads', () => {
    const files = unzipSync(sample);
    const manifest = JSON.parse(strFromU8(files['manifest.json']!));
    const path = 'setup/basemaps/la-selva-s2-2021.jpg';
    const bad = files[path]!.slice();
    bad[bad.length - 10] = bad[bad.length - 10]! ^ 0xff;
    files[path] = bad;
    // Keep the manifest consistent so only the basemap index's own checksum can catch it.
    manifest.contents.find((c: { path: string }) => c.path === path).sha256 = sha256Hex(bad);
    files['manifest.json'] = strToU8(JSON.stringify(manifest));
    const r = readBundle(zipSync(files));
    if (!r.ok) throw new Error(r.error);
    expect(r.problems.map((p) => p.path)).toEqual([path]);
    expect(r.hq!.basemapFiles).toEqual({});
    expect(r.hq!.transects?.features).toHaveLength(3);
  });
});
