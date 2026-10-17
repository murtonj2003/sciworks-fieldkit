// The species picker's forgiving search (shared searchTaxa) against the demo pack, as the picker uses it.
import * as fs from 'node:fs';
import { describe, expect, it } from 'vitest';

import { searchTaxa, type SpeciesPack } from '@sciworks/shared';

const pack = JSON.parse(fs.readFileSync(new URL('../../demo-data/species-pack.json', import.meta.url), 'utf8')) as SpeciesPack;
const pick = (q: string) => searchTaxa(q, pack.taxa, { limit: pack.taxa.length });
const closeMatch = (reason: string) => reason === 'spelling' || reason === 'sounds-like';

describe('species picker search', () => {
  it('a misspelt "leptodira" finds Leptodeira ornata first, marked as a close match', () => {
    const [top] = pick('leptodira');
    expect(top?.taxon.scientificName).toBe('Leptodeira ornata');
    expect(closeMatch(top!.reason)).toBe(true);
  });

  it('a correctly typed start of a name is not marked as a close match', () => {
    const [top] = pick('lepto');
    expect(top?.taxon.scientificName.startsWith('Lepto')).toBe(true);
    expect(closeMatch(top!.reason)).toBe(false);
  });

  it('"kyronius" (heard, not read) finds Chironius grandisquamis', () => {
    expect(pick('kyronius')[0]?.taxon.scientificName).toBe('Chironius grandisquamis');
  });

  it('an empty box returns nothing from the search, so the picker shows the whole list', () => {
    expect(pick('  ')).toEqual([]);
  });
});
