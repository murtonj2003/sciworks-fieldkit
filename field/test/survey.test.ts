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
