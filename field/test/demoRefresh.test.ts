// A phone that loaded an older copy of the built-in demo (before the satellite picture and species photos) picks
// them up once on start, without touching anything else; the same copy is never applied twice.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

process.env.FIELD_TEST_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'demo-refresh-')), 'field.db');

const fixture = (name: string) => new Uint8Array(fs.readFileSync(new URL(`../../shared/fixtures/${name}`, import.meta.url)));

async function app() {
  vi.resetModules();
  const [receive, refresh, basemaps, photos, db] = await Promise.all([
    import('@/sync/receiveHq'),
    import('@/sync/demoRefresh'),
    import('@/db/basemaps'),
    import('@/db/speciesPhotos'),
    import('@/db/db'),
  ]);
  return { receive, refresh, basemaps, photos, db };
}

describe('Built-in demo refresh', () => {
  it('does nothing before a project is loaded', async () => {
    const a = await app();
    expect(a.refresh.refreshDemoSetup(fixture('HQ_sample.zip'), 'HQ_sample.zip')).toBeNull();
  });

  it('adds the satellite picture and species photos to a phone that loaded an older demo, once', async () => {
    const a = await app();
    // An afternoon phone: the demo project is loaded, but its copy had no picture and no photos.
    expect(a.receive.receiveHqBundle(fixture('HQ_sample.zip'), 'HQ_sample.zip').ok).toBe(true);
    a.db.run("DELETE FROM setup WHERE key LIKE 'basemap:%' OR key LIKE 'speciesPhoto:%'");
    expect(a.basemaps.listBasemaps()).toHaveLength(0);
    expect(Object.keys(a.photos.listSpeciesPhotos())).toHaveLength(0);
    const revsBefore = a.db.all<{ n: number }>('SELECT COUNT(*) AS n FROM record_revs')[0]!.n;

    const r = a.refresh.refreshDemoSetup(fixture('HQ_sample.zip'), 'HQ_sample.zip');
    expect(r?.ok).toBe(true);
    expect(r?.changes).toContain('Satellite picture: Satellite (Sentinel-2, 2021)');
    expect(r?.changes).toContain('Species photos for offline use: 18 saved');
    expect(a.basemaps.listBasemaps()).toHaveLength(1);
    expect(Object.keys(a.photos.listSpeciesPhotos())).toHaveLength(18);
    expect(a.db.all<{ n: number }>('SELECT COUNT(*) AS n FROM record_revs')[0]!.n).toBe(revsBefore);

    // The same built-in copy is never applied again.
    expect(a.refresh.refreshDemoSetup(fixture('HQ_sample.zip'), 'HQ_sample.zip')).toBeNull();
  });
});
