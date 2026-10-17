// Sun and moon for a survey, calculated offline (SHARED-CONTRACT §8). Fills Survey.astro with no typing.

import * as SunCalc from 'suncalc';
import { offsetMinutesOf, toIsoWithOffset } from '../time';
import type { Astro, IsoTime } from '../types';

const DAY = 86400000;

export function astroFor(startedAt: IsoTime, lat: number, lon: number): Astro {
  const start = new Date(startedAt);
  const offset = offsetMinutesOf(startedAt);

  // SunCalc works per calendar day, so look at yesterday, today and tomorrow and take the most
  // recent sunset before the start. A survey at 01:00 belongs to the previous evening's sunset.
  const days = [-1, 0, 1]
    .map((d) => SunCalc.getTimes(new Date(start.getTime() + d * DAY), lat, lon))
    .flatMap((t) => (t.sunset && t.sunrise && !Number.isNaN(t.sunset.getTime()) ? [{ sunrise: t.sunrise, sunset: t.sunset }] : []));
  const before = days.filter((t) => t.sunset.getTime() <= start.getTime());
  const byRecent = [...before].sort((a, b) => b.sunset.getTime() - a.sunset.getTime());
  const byNearest = [...days].sort(
    (a, b) => Math.abs(a.sunset.getTime() - start.getTime()) - Math.abs(b.sunset.getTime() - start.getTime()),
  );
  const chosen = byRecent[0] ?? byNearest[0];

  const illum = SunCalc.getMoonIllumination(start);
  const moon = SunCalc.getMoonPosition(start, lat, lon);

  return {
    sunrise: chosen ? toIsoWithOffset(chosen.sunrise, offset) : '',
    sunset: chosen ? toIsoWithOffset(chosen.sunset, offset) : '',
    moonPhase: Math.round(illum.phase * 1000) / 1000,
    moonIlluminationPct: Math.round(illum.fraction * 100),
    moonAboveHorizonAtStart: moon.altitude > 0,
    minutesAfterSunsetAtStart: chosen ? Math.round((start.getTime() - chosen.sunset.getTime()) / 60000) : 0,
  };
}
