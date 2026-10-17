// Species photos from HQ (CONTRACT CHANGED, Sat 21:15): saved on the phone when an HQ bundle is received, newest
// per taxonId, each with the credit that must show beside it; the online iNaturalist link is only a fallback.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

process.env.FIELD_TEST_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'species-photos-')), 'field.db');

import { sha256Hex, type SpeciesPack } from '@sciworks/shared';

import { photoChoices } from '@/lib/speciesGuide';

const fixture = (name: string) => new Uint8Array(fs.readFileSync(new URL(`../../shared/fixtures/${name}`, import.meta.url)));
const readFile = (uri: string) => new Uint8Array(fs.readFileSync(uri.replace('file://', '')));

async function app() {
  vi.resetModules();
  const [receive, photos, setup] = await Promise.all([import('@/sync/receiveHq'), import('@/db/speciesPhotos'), import('@/db/setup')]);
  return { receive, photos, setup };
}

describe('Species photos', () => {
  it('saves the sample HQ bundle’s photos with their credits, once', async () => {
    const a = await app();
    const r = a.receive.receiveHqBundle(fixture('HQ_sample.zip'), 'HQ_sample.zip');
    expect(r.ok).toBe(true);
    expect(r.changes).toContain('Species photos for offline use: 18 saved');

    const saved = a.photos.listSpeciesPhotos();
    expect(Object.keys(saved)).toHaveLength(18);
    for (const p of Object.values(saved)) {
      expect(p.credit).toMatch(/CC BY 4\.0|CC0/);
      const bytes = readFile(a.photos.speciesPhotoFile(p).uri);
      expect(bytes.length).toBe(p.bytes);
      expect(sha256Hex(bytes)).toBe(p.sha256);
    }

    // Same bundle again: nothing new, still 18.
    const again = a.receive.receiveHqBundle(fixture('HQ_sample.zip'), 'HQ_sample.zip');
    expect(again.changes.some((c) => c.startsWith('Species photos'))).toBe(false);
    expect(Object.keys(a.photos.listSpeciesPhotos())).toHaveLength(18);
  });

  it('shows the saved photo first and falls back to the online link only without one', async () => {
    const a = await app();
    const pack = a.setup.currentSetup<SpeciesPack>('species-pack')!.value;
    const saved = a.photos.listSpeciesPhotos();
    const withPhoto = pack.taxa.find((t) => saved[t.taxonId])!;
    const choices = photoChoices(withPhoto, saved[withPhoto.taxonId]);
    expect(choices[0]).toEqual({ kind: 'saved', credit: saved[withPhoto.taxonId]!.credit });

    const without = pack.taxa.filter((t) => !saved[t.taxonId]);
    expect(without).toHaveLength(1); // 18 of the pack's 19 have a photo
    expect(photoChoices(without[0]!, undefined).every((c) => c.kind === 'online')).toBe(true);
  });

  it('keeps only the newest photo per species and tidies the old file away', async () => {
    const a = await app();
    const [id, old] = Object.entries(a.photos.listSpeciesPhotos())[0]!;
    const bytes = new Uint8Array([9, 8, 7]);
    const newer = { ...old, sha256: sha256Hex(bytes), bytes: bytes.length, credit: 'Someone · CC0 · via test' };

    expect(a.photos.saveSpeciesPhotos([newer], { [id]: bytes }, 'test', '2000-01-01T00:00:00Z')).toEqual([]);
    expect(a.photos.listSpeciesPhotos()[id]!.sha256).toBe(old.sha256);

    expect(a.photos.saveSpeciesPhotos([newer], { [id]: bytes }, 'test', '2099-01-01T00:00:00Z')).toEqual(['Species photos updated: 1']);
    const now = a.photos.listSpeciesPhotos()[id]!;
    expect(now.credit).toBe('Someone · CC0 · via test');
    expect(fs.existsSync(a.photos.speciesPhotoFile(old).uri.replace('file://', ''))).toBe(false);
  });
});
