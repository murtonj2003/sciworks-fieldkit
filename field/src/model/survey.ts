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

export function isNight(survey: LocalSurvey): boolean {
  const a = survey.astro;
  if (!a) return false;
  return a.minutesAfterSunsetAtStart > 0 || new Date(survey.startedAt) < new Date(a.sunrise);
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
