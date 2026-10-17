// Satellite basemap from HQ (SHARED-CONTRACT changelog, Sat 16:50): saved on the phone when an HQ bundle is
// received, newest per basemapId, and drawn so its corners line up with the transect line's own maths.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

process.env.FIELD_TEST_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'basemap-')), 'field.db');

import { sha256Hex, type TransectCollection } from '@sciworks/shared';

import { makeFrame } from '@/lib/mapFrame';

const fixture = (name: string) => new Uint8Array(fs.readFileSync(new URL(`../../shared/fixtures/${name}`, import.meta.url)));
const readFile = (uri: string) => new Uint8Array(fs.readFileSync(uri.replace('file://', '')));

async function app() {
  vi.resetModules();
  const [receive, basemaps, setup] = await Promise.all([import('@/sync/receiveHq'), import('@/db/basemaps'), import('@/db/setup')]);
  return { receive, basemaps, setup };
}

describe('Satellite basemap', () => {
  it('saves the sample HQ bundle’s picture and its details, once', async () => {
    const a = await app();
    const r = a.receive.receiveHqBundle(fixture('HQ_sample.zip'), 'HQ_sample.zip');
    expect(r.ok).toBe(true);
    expect(r.changes).toContain('Satellite picture: Satellite (Sentinel-2, 2021)');

    const list = a.basemaps.listBasemaps();
    expect(list).toHaveLength(1);
    const b = list[0]!;
    expect(b.basemapId).toBe('la-selva-s2-2021');
    expect(b.attribution).toMatch(/ESA WorldCover 2021.*CC BY 4\.0/);
    expect(b.bounds).toEqual({ latMin: 10.398, latMax: 10.44, lonMin: -84.03708333333333, lonMax: -83.975 });
    const bytes = readFile(a.basemaps.basemapFile(b).uri);
    expect(bytes.length).toBe(b.bytes);
    expect(sha256Hex(bytes)).toBe(b.sha256);

    // Same bundle again: nothing new, still one picture.
    const again = a.receive.receiveHqBundle(fixture('HQ_sample.zip'), 'HQ_sample.zip');
    expect(again.changes.some((c) => c.startsWith('Satellite picture'))).toBe(false);
    expect(a.basemaps.listBasemaps()).toHaveLength(1);
  });

  it('survives a restart and is the picture for each La Selva transect', async () => {
    const a = await app();
    const transects = a.setup.currentSetup<TransectCollection>('transects')!.value;
    const list = a.basemaps.listBasemaps();
    for (const f of transects.features) {
      const line = f.geometry.coordinates as [number, number][];
      expect(a.basemaps.basemapFor(list, f.properties.transectId, line)?.basemapId).toBe('la-selva-s2-2021');
    }
  });

  it('keeps only the newest picture per basemapId', async () => {
    const a = await app();
    const old = a.basemaps.listBasemaps()[0]!;
    const newer = { ...old, sha256: 'f'.repeat(64), name: 'Satellite (newer)' };
    const changes = a.basemaps.saveBasemaps([newer], { [old.basemapId]: new Uint8Array([1, 2, 3]) }, 'test', '2099-01-01T00:00:00Z');
    expect(changes).toEqual(['Satellite picture updated: Satellite (newer)']);
    expect(a.basemaps.listBasemaps()[0]!.name).toBe('Satellite (newer)');
    expect(fs.existsSync(a.basemaps.basemapFile(old).uri.replace('file://', ''))).toBe(false); // old file gone

    // An older bundle arriving later does not put the old picture back.
    a.receive.receiveHqBundle(fixture('HQ_sample.zip'), 'HQ_sample.zip');
    expect(a.basemaps.listBasemaps()[0]!.name).toBe('Satellite (newer)');
  });

  it('places the picture so its corners and every line point land on the same x/y as the line', async () => {
    const a = await app();
    const transects = a.setup.currentSetup<TransectCollection>('transects')!.value;
    const b = a.basemaps.listBasemaps()[0]!;
    const { latMin, latMax, lonMin, lonMax } = b.bounds;
    for (const f of transects.features) {
      const line = f.geometry.coordinates as [number, number][];
      // Both the plain frame and the one slid to fill the box with the picture.
      for (const frame of [makeFrame(line, 340, 190, 26), makeFrame(line, 340, 190, 26, [], b.bounds)]) {
        const r = frame.rect(b.bounds);
        // Corners: top-left is (lonMin, latMax), bottom-right is (lonMax, latMin), north up.
        const tl = frame.px(lonMin, latMax);
        const br = frame.px(lonMax, latMin);
        expect(r.x).toBeCloseTo(tl.x, 9);
        expect(r.y).toBeCloseTo(tl.y, 9);
        expect(r.x + r.width).toBeCloseTo(br.x, 9);
        expect(r.y + r.height).toBeCloseTo(br.y, 9);
        expect(r.width).toBeGreaterThan(0);
        expect(r.height).toBeGreaterThan(0);
        // Each vertex of the line, found as a pixel in the picture and stretched into the rect, sits exactly
        // where the line itself is drawn (preserveAspectRatio="none").
        for (const [lon, lat] of line) {
          const u = (lon - lonMin) / (lonMax - lonMin);
          const v = (latMax - lat) / (latMax - latMin);
          const p = frame.px(lon, lat);
          expect(r.x + u * r.width).toBeCloseTo(p.x, 6);
          expect(r.y + v * r.height).toBeCloseTo(p.y, 6);
          // ...and the line is never pushed off the map by the slide.
          expect(p.x).toBeGreaterThanOrEqual(13 - 1e-9);
          expect(p.x).toBeLessThanOrEqual(340 - 13 + 1e-9);
        }
      }
      // Slid to cover: the picture fills the whole 340 × 190 box (it is far bigger than any one transect).
      const c = makeFrame(line, 340, 190, 26, [], b.bounds).rect(b.bounds);
      expect(c.x).toBeLessThanOrEqual(1e-9);
      expect(c.y).toBeLessThanOrEqual(1e-9);
      expect(c.x + c.width).toBeGreaterThanOrEqual(340 - 1e-9);
      expect(c.y + c.height).toBeGreaterThanOrEqual(190 - 1e-9);
    }
    // One worked number, by hand, for T-LS-02 in the 340 × 190 frame (pad 26).
    const line = transects.features.find((f) => f.properties.transectId === 'T-LS-02')!.geometry.coordinates as [number, number][];
    const lons = line.map(([lo]) => lo);
    const lats = line.map(([, la]) => la);
    const mLon = 111_320 * Math.cos((((Math.min(...lats) + Math.max(...lats)) / 2) * Math.PI) / 180);
    const spanX = (Math.max(...lons) - Math.min(...lons)) * mLon;
    const spanY = (Math.max(...lats) - Math.min(...lats)) * 111_320;
    const k = Math.min(288 / spanX, 138 / spanY);
    const x0 = (340 - spanX * k) / 2 + (lonMin - Math.min(...lons)) * mLon * k;
    const y0 = 190 - ((190 - spanY * k) / 2 + (latMax - Math.min(...lats)) * 111_320 * k);
    const r = makeFrame(line, 340, 190, 26).rect(b.bounds);
    expect(r.x).toBeCloseTo(x0, 9);
    expect(r.y).toBeCloseTo(y0, 9);
  });
});
