import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { astroFor, checkRanges, offsetMinutesOf, toIsoWithOffset, type Encounter, type SpeciesPack } from '../src/index';
import { encounters } from '../scripts/make-fixtures';

const pack = JSON.parse(readFileSync(new URL('../../demo-data/species-pack.json', import.meta.url), 'utf8')) as SpeciesPack;

describe('checkRanges', () => {
  it('flags the SVL typed with an extra zero, and leaves normal animals alone', () => {
    const [e1, e2, e3] = encounters as [Encounter, Encounter, Encounter];
    expect(checkRanges(e2, pack)[0]?.message).toContain('above this pack');
    expect(checkRanges(e1, pack)).toEqual([]);
    expect(checkRanges(e3, pack)).toEqual([]);
  });
});

describe('species pack', () => {
  it('keeps a source and a licence on every value, and marks venomous families', () => {
    for (const t of pack.taxa) for (const tr of t.traits) expect(tr.source && tr.licence).toBeTruthy();
    expect(pack.taxa.find((t) => t.scientificName === 'Bothrops asper')?.dangerous).toBe(true);
    expect(pack.disclaimer).toMatch(/not for field ID/);
  });
  it('still supports the three demo key runs', () => {
    const rows = (name: string) => pack.taxa.find((t) => t.scientificName === name)?.traits.find((x) => x.trait === 'dorsalRowsMidbody')?.range;
    const tenRows = pack.taxa.filter((t) => t.traits.some((x) => x.trait === 'dorsalRowsMidbody' && x.range && (x.range.min ?? 0) <= 10 && (x.range.max ?? 99) >= 10));
    expect(tenRows.map((t) => t.scientificName)).toEqual(['Chironius grandisquamis']);
    expect(rows('Oxybelis fulgidus')).toEqual({ min: 17, max: 17 });
    const rows27 = pack.taxa.filter((t) => t.traits.some((x) => x.trait === 'dorsalRowsMidbody' && x.range && (x.range.min ?? 0) <= 27 && (x.range.max ?? 0) >= 27));
    expect(rows27.map((t) => t.scientificName)).toEqual(['Bothrops asper']);
  });
});

describe('astro and time', () => {
  it('fills sun and moon for a night survey, offline', () => {
    const a = astroFor('2026-10-16T18:45:00-06:00', 10.4095, -84.031);
    expect(a.sunset.startsWith('2026-10-16T17:')).toBe(true);
    expect(a.minutesAfterSunsetAtStart).toBeGreaterThan(60);
    expect(a.moonIlluminationPct).toBeGreaterThanOrEqual(0);
  });
  it('a survey after midnight belongs to the previous evening', () => {
    const a = astroFor('2026-10-17T01:30:00-06:00', 10.4095, -84.031);
    expect(a.sunset.startsWith('2026-10-16T17:')).toBe(true);
  });
  it('keeps the site offset in timestamps', () => {
    expect(offsetMinutesOf('2026-10-16T18:45:00-06:00')).toBe(-360);
    expect(toIsoWithOffset(new Date('2026-10-17T00:45:00Z'), -360)).toBe('2026-10-16T18:45:00-06:00');
  });
});
