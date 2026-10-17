// Survey helpers: protocol go/no-go warnings (warn, never block), effort, sun and moon.
import { astroFor, type ProtocolRule, type Transect } from '@sciworks/shared';

import { getPath } from './form';
import type { LocalSurvey, LocalWeather } from './records';

export function protocolHits(rules: ProtocolRule[] | undefined, survey: LocalSurvey): ProtocolRule[] {
  return (rules ?? []).filter((rule) => {
    const v = getPath(survey, rule.fieldPath);
    if (v === undefined || v === null) return false;
    if (rule.op === 'in') return rule.values.includes(v as string | number);
    const limit = Number(rule.values[0]);
    return rule.op === 'gt' ? Number(v) > limit : Number(v) < limit;
  });
}

/** (finish − start) × surveyors, in person-hours, to 2 decimals. */
export function effortPersonHours(survey: LocalSurvey, finishedAt: string): number {
  const hours = (new Date(finishedAt).getTime() - new Date(survey.startedAt).getTime()) / 3_600_000;
  return Math.max(0, Math.round(hours * survey.surveyorCount * 100) / 100);
}

/** Sun and moon for the start of the walk, at the transect's first point. Offline (suncalc). */
export function astroAtStart(startedAt: string, transect: Transect | undefined): LocalSurvey['astro'] {
  const first = transect?.geometry.coordinates[0];
  if (!first) return undefined;
  const [lon, lat] = first as [number, number];
  return astroFor(startedAt, lat, lon);
}

/** Night = between the sunset astroFor() picked (the last one before the start) and the sunrise after it.
 * astroFor's `sunrise` is the morning of that sunset's day, so step it forward past the sunset. */
/** Herp add-on questions that only make sense at night (MOBILE-BRIEF F7). Shown by day only if already answered. */
export const NIGHT_ONLY_PATHS = new Set(['herp.moonVisible', 'herp.leafLitterMoisture']);

export function isNight(survey: Pick<LocalSurvey, 'startedAt' | 'astro'>): boolean {
  const a = survey.astro;
  if (!a?.sunset || !a.sunrise) return false;
  const start = new Date(survey.startedAt).getTime();
  const sunset = new Date(a.sunset).getTime();
  let nextSunrise = new Date(a.sunrise).getTime();
  while (nextSunrise <= sunset) nextSunrise += 86_400_000;
  return start > sunset && start < nextSunrise;
}

export interface WeatherPreset {
  label: string;
  weather: Pick<LocalWeather, 'cloud' | 'rainNow' | 'windBeaufort'>;
}

export function weatherPresets(previous: LocalWeather | undefined, sameLabel = 'Same as last survey'): WeatherPreset[] {
  const presets: WeatherPreset[] = [
    { label: 'Under canopy · dry · calm', weather: { cloud: 'cannot-assess', rainNow: 'none', windBeaufort: 0 } },
    { label: 'Clear · dry · calm', weather: { cloud: 'clear', rainNow: 'none', windBeaufort: 0 } },
    { label: 'Overcast · drizzle · light air', weather: { cloud: 'overcast', rainNow: 'drizzle', windBeaufort: 1 } },
  ];
  if (previous?.cloud && previous.rainNow && previous.windBeaufort !== undefined) {
    presets.unshift({
      label: sameLabel,
      weather: { cloud: previous.cloud, rainNow: previous.rainNow, windBeaufort: previous.windBeaufort },
    });
  }
  return presets;
}
