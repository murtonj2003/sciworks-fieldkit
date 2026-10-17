// The trait key against the demo pack: the three stage runs, plus the rules from SHARED-CONTRACT §8.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { runKey, type SpeciesPack } from '../src/index';

const pack = JSON.parse(readFileSync(new URL('../../demo-data/species-pack.json', import.meta.url), 'utf8')) as SpeciesPack;
const top = (r: ReturnType<typeof runKey>) => r.candidates[0]!;

describe('runKey (demo runs)', () => {
  it('10 midbody rows → Chironius grandisquamis, with the reason', () => {
    const r = runKey({ dorsalRowsMidbody: 10 }, pack);
    expect(top(r).scientificName).toBe('Chironius grandisquamis');
    expect(top(r).score).toBe(1);
    expect(top(r).matched[0]).toMatch(/10 midbody scale rows/);
    expect(r.candidates.filter((c) => c.score === 1)).toHaveLength(1);
    expect(r.checkNext).toBeDefined();
  });

  it('17 rows + divided anal plate + 150 subcaudals (tail intact) → Oxybelis fulgidus', () => {
    const r = runKey({ dorsalRowsMidbody: 17, analPlate: 'divided', subcaudals: 150, tailCondition: 'intact' }, pack);
    expect(top(r).scientificName).toBe('Oxybelis fulgidus');
    expect(top(r).score).toBe(1);
    expect(top(r).matched).toHaveLength(3);
    const dend = r.candidates.find((c) => c.scientificName === 'Dendrophidion apharocybe')!;
    expect(dend.conflicts.join(' ')).toMatch(/anal plate divided, but the pack says single/);
  });

  it('27 rows → Bothrops asper, flagged dangerous', () => {
    const r = runKey({ dorsalRowsMidbody: 27 }, pack);
    expect(top(r).scientificName).toBe('Bothrops asper');
    expect(top(r).dangerous).toBe(true);
    expect(r.candidates.find((c) => c.scientificName === 'Bothriechis nigroadspersus')).toBeUndefined();
  });
});

describe('runKey (rules)', () => {
  it('ignores subcaudals unless the tail is intact', () => {
    const broken = runKey({ dorsalRowsMidbody: 17, subcaudals: 20, tailCondition: 'broken' }, pack);
    const oxy = broken.candidates.find((c) => c.scientificName === 'Oxybelis fulgidus')!;
    expect(oxy.conflicts).toEqual([]);
    expect(oxy.score).toBe(1);
    expect(broken.checkNext).not.toBe('subcaudals');
  });

  it('uses sex-specific ranges when the sex is known', () => {
    // Bothrops asper ventrals: males 161–216, females 187–240.
    const male = runKey({ dorsalRowsMidbody: 27, ventrals: 230, sex: 'male' }, pack);
    const female = runKey({ dorsalRowsMidbody: 27, ventrals: 230, sex: 'female' }, pack);
    const ba = (r: ReturnType<typeof runKey>) => r.candidates.find((c) => c.scientificName === 'Bothrops asper')!;
    expect(ba(male).conflicts[0]).toMatch(/males 161–216/);
    expect(ba(female).matched.join(' ')).toMatch(/230 ventrals \(pack: females 187–240\)/);
    const unknownSex = runKey({ dorsalRowsMidbody: 27, ventrals: 230 }, pack);
    expect(ba(unknownSex).matched.join(' ')).toMatch(/230 ventrals/);
  });

  it('treats missing pack data as unknown, never as a mismatch', () => {
    const r = runKey({ dorsalRowsMidbody: 19 }, pack);
    const micrurus = r.candidates.find((c) => c.scientificName === 'Micrurus alleni')!;
    expect(micrurus.conflicts).toEqual([]);
    expect(micrurus.unknown[0]).toMatch(/no data/);
    expect(r.candidates[0]!.score).toBeGreaterThan(micrurus.score);
  });

  it('a count just outside the range is a soft conflict, still listed', () => {
    const r = runKey({ ventrals: 196, dorsalRowsMidbody: 17, analPlate: 'divided' }, pack);
    const oxy = r.candidates.find((c) => c.scientificName === 'Oxybelis fulgidus')!;
    expect(oxy.conflicts[0]).toMatch(/just outside/);
    expect(oxy.score).toBeGreaterThan(0.8);
  });

  it('with nothing entered, returns every species and suggests midbody rows first', () => {
    const r = runKey({}, pack);
    expect(r.candidates).toHaveLength(pack.taxa.length);
    expect(r.checkNext).toBe('dorsalRowsMidbody');
  });
});
