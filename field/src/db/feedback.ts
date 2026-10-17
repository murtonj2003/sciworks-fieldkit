// What HQ has told this phone: receipts ("HQ has this rev"), reviews, correction requests, decisions.
// Receipts never delete or hide local data; they only move the "not with HQ" counter.
import type {
  ChangeRequestDecision,
  CorrectionRequest,
  CorrectionResponse,
  Receipt,
  Review,
  ReviewStatus,
  TaxonDecision,
} from '@sciworks/shared';

import { all, first, run } from './db';
import { getMeta } from './meta';
import { listPhotos } from './photos';
import { flushDrafts, getSealed } from './records';
import type { LocalRecord } from '@/model/records';

export function addReceipts(receipts: Receipt[]): number {
  let added = 0;
  for (const r of receipts) {
    added += run('INSERT OR IGNORE INTO receipts (id, rev, record_type, received_at) VALUES (?, ?, ?, ?)', [
      r.id,
      r.rev,
      r.recordType,
      r.receivedAt,
    ]);
  }
  return added;
}

/** The highest rev HQ has confirmed for a record (0 = none). */
export function receiptRev(id: string): number {
  return first<{ rev: number }>('SELECT MAX(rev) AS rev FROM receipts WHERE id = ?', [id])?.rev ?? 0;
}

export function addReviews(reviews: Review[]): number {
  let added = 0;
  for (const r of reviews) {
    added += run('INSERT OR IGNORE INTO reviews (id, rev, status, at, json) VALUES (?, ?, ?, ?, ?)', [
      r.id,
      r.rev,
      r.status,
      r.at,
      JSON.stringify(r),
    ]);
  }
  return added;
}

/** Latest review per record, by arrival order (device clocks drift, so never by time). */
export function latestReview(id: string): { status: ReviewStatus; rev: number; note?: string } | null {
  const row = first<{ json: string }>('SELECT json FROM reviews WHERE id = ? ORDER BY rev DESC, seq DESC LIMIT 1', [id]);
  if (!row) return null;
  const r = JSON.parse(row.json) as Review;
  return { status: r.status, rev: r.rev, note: r.note };
}

export function addCorrections(corrections: CorrectionRequest[], receivedAt: string): number {
  let added = 0;
  for (const c of corrections) {
    added += run('INSERT OR IGNORE INTO corrections (correction_id, record_id, json, received_at) VALUES (?, ?, ?, ?)', [
      c.correctionId,
      c.recordId,
      JSON.stringify(c),
      receivedAt,
    ]);
  }
  return added;
}

export function listCorrections(): { request: CorrectionRequest; response: CorrectionResponse | null }[] {
  return all<{ json: string; response: string | null }>(
    `SELECT c.json, r.json AS response FROM corrections c
       LEFT JOIN correction_responses r ON r.correction_id = c.correction_id
       ORDER BY c.received_at`,
  ).map((row) => ({
    request: JSON.parse(row.json) as CorrectionRequest,
    response: row.response ? (JSON.parse(row.response) as CorrectionResponse) : null,
  }));
}

export function addCorrectionResponse(r: CorrectionResponse): void {
  run('INSERT OR IGNORE INTO correction_responses (correction_id, json) VALUES (?, ?)', [r.correctionId, JSON.stringify(r)]);
}

export function listCorrectionResponses(): CorrectionResponse[] {
  return all<{ json: string }>('SELECT json FROM correction_responses').map((r) => JSON.parse(r.json));
}

export function addTaxonDecisions(ds: TaxonDecision[]): number {
  return ds.reduce(
    (n, d) =>
      n +
      run('INSERT OR IGNORE INTO decisions (kind, target_id, at, json) VALUES (?, ?, ?, ?)', [
        'taxon',
        d.provisionalTaxonId,
        d.at,
        JSON.stringify(d),
      ]),
    0,
  );
}

export function addChangeRequestDecisions(ds: ChangeRequestDecision[]): number {
  return ds.reduce(
    (n, d) =>
      n +
      run('INSERT OR IGNORE INTO decisions (kind, target_id, at, json) VALUES (?, ?, ?, ?)', [
        'change-request',
        d.changeRequestId,
        d.at,
        JSON.stringify(d),
      ]),
    0,
  );
}

export function taxonDecision(provisionalTaxonId: string): TaxonDecision | null {
  const row = first<{ json: string }>(
    "SELECT json FROM decisions WHERE kind = 'taxon' AND target_id = ? ORDER BY rowid DESC LIMIT 1",
    [provisionalTaxonId],
  );
  return row ? (JSON.parse(row.json) as TaxonDecision) : null;
}

// ---------- the counter (SHARED-CONTRACT §7.5) ----------

export interface Counter {
  recordsNotWithHq: number;
  photosNotWithHq: number;
  totalRecords: number;
  totalPhotos: number;
  lastHandoverAt: string | null;
  lastConfirmedAt: string | null;
}

/** N = records whose latest rev is newer than HQ's last receipt. A photo is with HQ once a receipted rev of
 * its record lists it. */
export function computeCounter(): Counter {
  flushDrafts();
  const latest = new Map<string, number>();
  for (const r of all<{ id: string; rev: number }>('SELECT id, MAX(rev) AS rev FROM record_revs GROUP BY id')) {
    latest.set(r.id, r.rev);
  }
  const dirty = new Set(all<{ id: string }>('SELECT id FROM drafts WHERE dirty = 1').map((r) => r.id));
  const ids = new Set([...latest.keys(), ...dirty]);
  let recordsNotWithHq = 0;
  const photosWithHq = new Set<string>();
  for (const id of ids) {
    const confirmed = receiptRev(id);
    if (dirty.has(id) || confirmed < (latest.get(id) ?? 0)) recordsNotWithHq += 1;
    const atHq = confirmed > 0 ? getSealed<LocalRecord>(id, confirmed) : null;
    if (atHq?.recordType === 'encounter') atHq.photoIds.forEach((p) => photosWithHq.add(p));
  }
  const photos = listPhotos();
  return {
    recordsNotWithHq,
    photosNotWithHq: photos.filter((p) => !photosWithHq.has(p.photoId)).length,
    totalRecords: ids.size,
    totalPhotos: photos.length,
    lastHandoverAt: getMeta('lastHandoverAt'),
    lastConfirmedAt: getMeta('lastConfirmedAt'),
  };
}
