// How full the phone is (Jack, Sat 19:00; design pick S1): the phone's own total and free space, what
// Fieldkit itself holds (its documents folder: database, photos, bundles, satellite pictures), and a rough
// "room for N more survey days" at the rate this phone has used so far. Fieldkit never deletes anything itself.
import { Paths } from 'expo-file-system';

import { all } from '@/db/db';

/** A photo-heavy day when there is no history yet: ~30 photos at ~0.8 MB plus records. */
const DEFAULT_DAY_BYTES = 25_000_000;

export interface PhoneStorage {
  total: number;
  free: number;
  app: number;
  /** Everything else on the phone (other apps, the system). */
  other: number;
  usedPct: number;
  daysOfRoom: number;
}

export function phoneStorage(): PhoneStorage | null {
  let total = 0;
  let free = 0;
  let app = 0;
  try {
    total = Paths.totalDiskSpace;
    free = Paths.availableDiskSpace;
    app = Paths.document.size ?? 0;
  } catch {
    return null;
  }
  if (!total || total <= 0) return null;
  const days = all<{ d: string }>("SELECT DISTINCT json_extract(json, '$.date') AS d FROM record_revs WHERE record_type = 'survey'").length;
  const perDay = days > 0 ? Math.max(app / days, 1_000_000) : DEFAULT_DAY_BYTES;
  const used = Math.max(0, total - free);
  return { total, free, app, other: Math.max(0, used - app), usedPct: Math.round((used / total) * 100), daysOfRoom: Math.floor(free / perDay) };
}

/** "1.2 GB", "340 MB", "80 GB". */
export function bytesWord(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)} GB`;
  if (n >= 1e6) return `${Math.round(n / 1e6)} MB`;
  return `${Math.max(1, Math.round(n / 1e3))} KB`;
}
