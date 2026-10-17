// The typed-coordinate rules the screen uses (model/location.ts), on the stage demo coordinate.
// Covers the reviewer's bugs A (a choice undone by an accuracy change), B (HQ fix shown red) and D (cleared box).
import * as fs from 'node:fs';
import { describe, expect, it } from 'vitest';

import { checkCoordinate, parseTyped, type Location, type Project, type Transect } from '@sciworks/shared';

import { acceptSuggestion, isMoved, keepTyped, nextDistance, onEntryChange, whereNow } from '@/model/location';

const read = (p: string) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const project = read('../../demo-data/project.json') as Project;
const transect = (read('../../demo-data/transects.geojson').features as Transect[]).find((f) => f.properties.transectId === 'T-LS-02')!;
const FACTS = read('../../shared/fixtures/facts.json');
const RAW = FACTS.demoTypo.typed as string; // '16P 825749 1151370'
const ctx = { transect, project, personId: 'p-b-1', now: () => '2026-10-17T20:00:00-06:00' };

describe('typed coordinate rules', () => {
  const typed = onEntryChange(undefined, RAW, 'utm16n', undefined, ctx);
  const sg = typed.location!.check.suggestions[0]!;

  it('the demo typo is red, offers the swap, and fills no distance', () => {
    expect(typed.location?.check.band).toBe('red');
    expect(sg.explain).toMatch(/Swap the 4th and 5th digits of the northing/);
    expect(typed.distance).toEqual({ action: 'clear' });
  });

  it('"Use this" moves the point, keeps the typed text and original, and fills distance along', () => {
    const used = acceptSuggestion(RAW, 'utm16n', undefined, sg, ctx);
    const loc = used.location!;
    expect(loc.typed?.raw).toBe(RAW);
    expect(isMoved(loc)).toBe(true);
    expect(loc.check.decision?.kind).toBe('accepted-suggestion');
    expect(whereNow(loc, ctx).band).toBe('green');
    expect(whereNow(loc, ctx).offsetM).toBeCloseTo(FACTS.demoTypo.fixedOffsetM, 0);
    expect(used.distance).toEqual({ action: 'set', valueM: FACTS.demoTypo.fixedDistanceAlongM });
  });

  it('A: typing a GPS accuracy afterwards keeps the used suggestion (not the mistyped point)', () => {
    const used = acceptSuggestion(RAW, 'utm16n', undefined, sg, ctx).location!;
    const after = onEntryChange(used, RAW, 'utm16n', 5, ctx);
    expect(after.location?.lat).toBe(used.lat);
    expect(after.location?.lon).toBe(used.lon);
    expect(after.location?.original).toEqual(used.original);
    expect(after.location?.accuracyM).toBe(5);
    expect(after.location?.check.decision?.kind).toBe('accepted-suggestion');
    expect(after.distance).toEqual({ action: 'keep' });
  });

  it('A: "Keep as typed" also survives an accuracy change', () => {
    const kept = keepTyped(RAW, 'utm16n', undefined, 'kept-original', undefined, ctx).location!;
    const after = onEntryChange(kept, RAW, 'utm16n', 4, ctx);
    expect(after.location?.check.decision?.kind).toBe('kept-original');
  });

  it('changing the format or the text is a new reading: the old choice and auto distance go', () => {
    const used = acceptSuggestion(RAW, 'utm16n', undefined, sg, ctx).location!;
    const otherGrid = onEntryChange(used, RAW, 'utm17n', undefined, ctx);
    expect(otherGrid.location?.check.decision).toBeUndefined();
    expect(isMoved(otherGrid.location)).toBe(false);
    expect(nextDistance({ value: 1155, source: 'auto' }, otherGrid.distance)).toBeUndefined();
  });

  it('D: an empty or unreadable box stores no point (the record matches the screen)', () => {
    expect(onEntryChange(undefined, '', 'utm16n', undefined, ctx).location).toBeUndefined();
    expect(onEntryChange(undefined, '16P 8257', 'utm16n', undefined, ctx).location).toBeUndefined();
  });

  it('a typed distance along is the person’s and is never overwritten', () => {
    const typedDistance = { value: 1200, source: 'typed' as const };
    expect(nextDistance(typedDistance, { action: 'set', valueM: 1155 })).toEqual(typedDistance);
    expect(nextDistance(typedDistance, { action: 'clear' })).toEqual(typedDistance);
  });

  it('B: a location fixed by an accepted HQ correction reads as moved and green, and survives an accuracy change', () => {
    const p = parseTyped(FACTS.demoTypo.correct, 'utm16n') as { lat: number; lon: number };
    const before = typed.location!;
    const fixed: Location = {
      ...before,
      lat: p.lat,
      lon: p.lon,
      original: { lat: before.lat, lon: before.lon },
      check: { ...checkCoordinate(p, transect, project), decision: { kind: 'accepted-suggestion', reason: 'HQ correction: digits swapped', by: 'p-b-1', at: 'x' } },
    };
    expect(isMoved(fixed)).toBe(true);
    expect(whereNow(fixed, ctx).band).toBe('green');
    const after = onEntryChange(fixed, RAW, 'utm16n', 3, ctx);
    expect([after.location?.lat, after.location?.lon]).toEqual([p.lat, p.lon]);
  });
});
