// Species photos travel HQ → phone inside the HQ bundle, for offline use (added Sat 17 Oct, additive).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readBundle, sha256Hex } from '../src/index';

const sample = new Uint8Array(readFileSync(new URL('../fixtures/HQ_sample.zip', import.meta.url)));

describe('species photos in the HQ bundle', () => {
  it('carries one checksum-verified, credited CC BY / CC0 photo for 18 of the 19 species', () => {
    const r = readBundle(sample);
    if (!r.ok) throw new Error(r.error);
    expect(r.problems).toEqual([]);
    const photos = r.hq!.speciesPhotos!;
    expect(photos).toHaveLength(18);
    for (const p of photos) {
      expect(['CC BY 4.0', 'CC0 1.0']).toContain(p.licence);
      expect(p.credit).toContain(p.licence);
      const bytes = r.hq!.speciesPhotoFiles![p.taxonId]!;
      expect(sha256Hex(bytes)).toBe(p.sha256);
      expect(Math.max(p.widthPx, p.heightPx)).toBeLessThanOrEqual(400);
    }
    const taxa = new Set(r.hq!.speciesPack!.taxa.map((t) => t.taxonId));
    expect(photos.every((p) => taxa.has(p.taxonId))).toBe(true);
  });
});
