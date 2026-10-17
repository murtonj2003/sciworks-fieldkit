// Day or night for a survey, from the offline sun times (bug seen on Jack's iPhone: 07:51 showed "Night").
import { describe, expect, it } from 'vitest';

import { astroFor } from '@sciworks/shared';

import { isNight } from '@/model/survey';

const LA_SELVA = { lat: 10.4095, lon: -84.031 };
const at = (startedAt: string) => ({ startedAt, astro: astroFor(startedAt, LA_SELVA.lat, LA_SELVA.lon) });

describe('isNight', () => {
  it('is night after sunset and after midnight', () => {
    expect(isNight(at('2026-10-16T18:45:00-06:00'))).toBe(true);
    expect(isNight(at('2026-10-17T01:30:00-06:00'))).toBe(true);
    expect(isNight(at('2026-10-17T05:00:00-06:00'))).toBe(true);
  });
  it('is day after sunrise and in the afternoon', () => {
    expect(isNight(at('2026-10-17T07:51:00-06:00'))).toBe(false);
    expect(isNight(at('2026-10-17T08:27:00-06:00'))).toBe(false);
    expect(isNight(at('2026-10-17T12:00:00-06:00'))).toBe(false);
    expect(isNight(at('2026-10-17T17:00:00-06:00'))).toBe(false);
  });
  it('no sun data → not night', () => {
    expect(isNight({ startedAt: '2026-10-17T01:30:00-06:00', astro: undefined })).toBe(false);
  });
});

describe('F7: night extras and protocol warnings', () => {
  const template = JSON.parse(
    require('node:fs').readFileSync(new URL('../../demo-data/template.json', import.meta.url), 'utf8'),
  ) as import('@sciworks/shared').Template;
  const base = { startedAt: '2026-10-16T19:30:00-06:00', surveyorCount: 2, weatherStart: { at: '2026-10-16T19:30:00-06:00' } } as never;

  it('a night survey gets sun and moon with no typing', async () => {
    const { astroAtStart } = await import('@/model/survey');
    const transects = JSON.parse(require('node:fs').readFileSync(new URL('../../demo-data/transects.geojson', import.meta.url), 'utf8'));
    const a = astroAtStart('2026-10-16T19:30:00-06:00', transects.features[1]);
    expect(a?.minutesAfterSunsetAtStart).toBeGreaterThan(60);
    expect(a?.moonIlluminationPct).toBeGreaterThanOrEqual(0);
    expect(isNight({ startedAt: '2026-10-16T19:30:00-06:00', astro: a })).toBe(true);
  });

  it('heavy rain and strong wind warn; calm, dry weather does not (warnings never block)', async () => {
    const { protocolHits } = await import('@/model/survey');
    const at = (w: object) => ({ ...(base as object), weatherStart: { at: 'x', ...w } }) as never;
    expect(protocolHits(template.protocolRules, at({ rainNow: 'heavy', windBeaufort: 1 })).map((r) => r.code)).toEqual(['HEAVY_RAIN']);
    expect(protocolHits(template.protocolRules, at({ rainNow: 'none', windBeaufort: 5 })).map((r) => r.code)).toEqual(['STRONG_WIND']);
    expect(protocolHits(template.protocolRules, at({ rainNow: 'none', windBeaufort: 0 }))).toEqual([]);
    expect(protocolHits(template.protocolRules, at({}))).toEqual([]); // not answered yet: no warning
  });

  it('effort is (finish − start) × surveyors, in person-hours', async () => {
    const { effortPersonHours } = await import('@/model/survey');
    expect(effortPersonHours(base, '2026-10-16T23:00:00-06:00')).toBe(7);
  });

  it('the night-only questions are moon and leaf litter', async () => {
    const { NIGHT_ONLY_PATHS } = await import('@/model/survey');
    const paths = template.fields.filter((f) => NIGHT_ONLY_PATHS.has(f.path)).map((f) => f.path);
    expect(paths.sort()).toEqual(['herp.leafLitterMoisture', 'herp.moonVisible']);
  });
});
