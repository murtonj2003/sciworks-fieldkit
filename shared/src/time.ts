// Small time helpers. Records keep the site's UTC offset in every timestamp (SHARED-CONTRACT §1).

import type { IsoTime } from './types';

/** Minutes east of UTC from an ISO string: '-06:00' → -360, 'Z' → 0. */
export function offsetMinutesOf(iso: IsoTime): number {
  const m = iso.match(/([+-])(\d{2}):?(\d{2})$/);
  if (!m) return 0;
  const minutes = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === '-' ? -minutes : minutes;
}

/** Formats a Date as ISO 8601 with the given offset, to the second: '2026-10-17T19:42:10-06:00'. */
export function toIsoWithOffset(date: Date, offsetMinutes: number): IsoTime {
  const shifted = new Date(date.getTime() + offsetMinutes * 60000);
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${shifted.toISOString().slice(0, 19)}${sign}${hh}:${mm}`;
}
