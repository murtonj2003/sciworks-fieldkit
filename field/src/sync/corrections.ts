// HQ's correction requests (SHARED-CONTRACT §7.4 step 6). Accept = a new rev with the proposed value at
// `fieldPath`, plus a CorrectionResponse. Decline = a CorrectionResponse only. A person always decides.
import { checkCoordinate, type CorrectionRequest, type CorrectionResponse, type Location, type Project, type TransectCollection } from '@sciworks/shared';

import { addCorrectionResponse, listCorrections } from '@/db/feedback';
import { getRecord, saveDraftNow, seal } from '@/db/records';
import { touched } from '@/model/factory';
import { setPath } from '@/model/form';
import type { LocalRecord } from '@/model/records';

export interface InboxItem {
  request: CorrectionRequest;
  response: CorrectionResponse | null;
  record: LocalRecord | null;
}

export function inbox(): InboxItem[] {
  return listCorrections().map((c) => ({ ...c, record: getRecord(c.request.recordId) }));
}

/** Corrections for records on this phone that nobody has answered yet. */
export function pendingCount(): number {
  return inbox().filter((i) => i.record && !i.response).length;
}

export function acceptCorrection(
  item: InboxItem,
  ctx: { personId: string; at: string; project: Project | null; transects: TransectCollection | null },
): number | null {
  const record = item.record;
  if (!record) return null;
  const { fieldPath, proposed } = item.request;
  let next = setPath(record, fieldPath, proposed) as LocalRecord;

  // A moved point is re-checked on the phone, so the phone's own check sits on the record (HQ keeps its own).
  if (fieldPath === 'location' && next.recordType === 'encounter' && next.location && ctx.project) {
    const transect = ctx.transects?.features.find((f) => f.properties.transectId === next.transectId);
    if (transect) {
      const loc = next.location as Location;
      const check = checkCoordinate({ lat: loc.lat, lon: loc.lon, accuracyM: loc.accuracyM }, transect, ctx.project);
      next = { ...next, location: { ...loc, check } };
      if (next.distanceAlongM?.source !== 'typed') next = { ...next, distanceAlongM: { value: Math.round(check.chainageM), source: 'auto' } };
    }
  }

  saveDraftNow(touched(next, ctx.project?.timeZone));
  const newRev = seal(record.id) ?? record.rev;
  addCorrectionResponse({ correctionId: item.request.correctionId, decision: 'accepted', newRev, by: ctx.personId, at: ctx.at });
  return newRev;
}

export function declineCorrection(item: InboxItem, ctx: { personId: string; at: string }, note?: string): void {
  addCorrectionResponse({
    correctionId: item.request.correctionId,
    decision: 'declined',
    ...(note?.trim() ? { note: note.trim() } : {}),
    by: ctx.personId,
    at: ctx.at,
  });
}

/** "4,350 mm", "10.412345, -84.012345", "male". */
export function showValue(v: unknown): string {
  if (v === null || v === undefined) return '(empty)';
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.value === 'number' && typeof o.unit === 'string') return `${o.value.toLocaleString('en-GB')} ${o.unit}`;
    if (typeof o.lat === 'number' && typeof o.lon === 'number') return `${o.lat.toFixed(6)}, ${o.lon.toFixed(6)}`;
    return JSON.stringify(v);
  }
  return String(v);
}
