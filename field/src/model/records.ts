// Records as the phone holds them. A record is saved from the first tap, so while it's being filled in it
// may still lack a field the contract requires (an animal before its coordinate is typed, a survey before
// the weather taps). It is stored and sent anyway: half a record is still data. `missingForHq` says what
// is still needed, and HQ holds incomplete items aside instead of losing them.
import {
  encounterSchema,
  surveySchema,
  type Encounter,
  type Location,
  type Survey,
  type WeatherBlock,
} from '@sciworks/shared';

export type LocalWeather = Partial<WeatherBlock> & { at: string };

export type LocalSurvey = Omit<Survey, 'weatherStart' | 'weatherEnd'> & {
  weatherStart: LocalWeather;
  weatherEnd?: LocalWeather;
};

export type LocalEncounter = Omit<Encounter, 'location'> & { location?: Location };

export type LocalRecord = LocalSurvey | LocalEncounter;

const LABELS: Record<string, string> = {
  location: 'location',
  'weatherStart.cloud': 'start cloud',
  'weatherStart.rainNow': 'start rain',
  'weatherStart.windBeaufort': 'start wind',
  'weatherEnd.cloud': 'end cloud',
  'weatherEnd.rainNow': 'end rain',
  'weatherEnd.windBeaufort': 'end wind',
};

/** Plain-words list of what the contract still needs before HQ can use this record. Empty = complete. */
export function missingForHq(r: LocalRecord): string[] {
  // A brand-new draft has rev 0 until it is first sealed; that is not something the surveyor can fill in.
  const result = (r.recordType === 'survey' ? surveySchema : encounterSchema).safeParse({ ...r, rev: Math.max(1, r.rev) });
  if (result.success) return [];
  const names = result.error.issues.map((i) => {
    const path = i.path.join('.');
    return LABELS[path] ?? path;
  });
  return [...new Set(names)];
}
