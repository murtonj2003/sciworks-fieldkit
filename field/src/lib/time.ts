// Records carry site-local time with its offset (SHARED-CONTRACT §1): a phone set to London time still
// stamps a Costa Rica survey as -06:00.
import { toIsoWithOffset, type IsoDate, type IsoTime } from '@sciworks/shared';

const FIXED_OFFSETS: Record<string, number> = { 'America/Costa_Rica': -360 };

/** Minutes east of UTC for an IANA zone at a moment. Falls back to the phone's own offset. */
export function zoneOffsetMinutes(timeZone: string | undefined, at: Date = new Date()): number {
  if (!timeZone) return -at.getTimezoneOffset();
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(at);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    const minutes = Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
    if (Number.isFinite(minutes)) return minutes;
  } catch {
    // Intl without time-zone data: use the table, then the phone.
  }
  return FIXED_OFFSETS[timeZone] ?? -at.getTimezoneOffset();
}

export function nowIso(timeZone?: string, at: Date = new Date()): IsoTime {
  return toIsoWithOffset(at, zoneOffsetMinutes(timeZone, at));
}

export function localDate(iso: IsoTime): IsoDate {
  return iso.slice(0, 10);
}

/** '19:42' from an ISO time, read in its own offset. */
export function clockOf(iso: IsoTime | undefined): string {
  return iso ? iso.slice(11, 16) : '—';
}
