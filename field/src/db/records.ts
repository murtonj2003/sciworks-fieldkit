// Surveys and encounters. The JSON stored *is* the contract object, so a bundle is just a read.
//
// Life of a record:
//   every field change → saveDraft() (debounced ~300 ms, flushed when the app goes to the background)
//   leave the screen / Done / make a bundle / app start → seal(): the draft becomes the next rev
// record_revs is INSERT-only; the database refuses anything else.
import type { RecordType } from '@sciworks/shared';
import { AppState } from 'react-native';

import { all, first, run, tx } from './db';
import { nowIso } from '@/lib/time';
import type { LocalRecord } from '@/model/records';

interface RevRow {
  id: string;
  rev: number;
  record_type: RecordType;
  json: string;
}
interface DraftRow {
  id: string;
  record_type: RecordType;
  json: string;
  dirty: number;
}

export function latestRev(id: string): number {
  return first<{ rev: number }>('SELECT MAX(rev) AS rev FROM record_revs WHERE id = ?', [id])?.rev ?? 0;
}

export function getSealed<T extends LocalRecord>(id: string, rev?: number): T | null {
  const row = rev
    ? first<RevRow>('SELECT * FROM record_revs WHERE id = ? AND rev = ?', [id, rev])
    : first<RevRow>('SELECT * FROM record_revs WHERE id = ? ORDER BY rev DESC LIMIT 1', [id]);
  return row ? (JSON.parse(row.json) as T) : null;
}

/** What the screen should show: the unsealed draft if there is one, else the latest rev. */
export function getRecord<T extends LocalRecord>(id: string): T | null {
  const pending = pendingDrafts.get(id);
  if (pending) return pending as T;
  const draft = first<DraftRow>('SELECT * FROM drafts WHERE id = ? AND dirty = 1', [id]);
  if (draft) return JSON.parse(draft.json) as T;
  return getSealed<T>(id);
}

/** Current view of every record of a type (drafts win over their sealed rev). */
export function listRecords<T extends LocalRecord>(recordType: RecordType): T[] {
  flushDrafts();
  const sealed = all<RevRow>(
    `SELECT r.* FROM record_revs r
       JOIN (SELECT id, MAX(rev) AS rev FROM record_revs WHERE record_type = ? GROUP BY id) m
         ON r.id = m.id AND r.rev = m.rev`,
    [recordType],
  );
  const drafts = all<DraftRow>('SELECT * FROM drafts WHERE record_type = ? AND dirty = 1', [recordType]);
  const byId = new Map<string, T>();
  for (const row of sealed) byId.set(row.id, JSON.parse(row.json) as T);
  for (const row of drafts) byId.set(row.id, JSON.parse(row.json) as T);
  return [...byId.values()];
}

export function history(id: string): LocalRecord[] {
  return all<RevRow>('SELECT * FROM record_revs WHERE id = ? ORDER BY rev', [id]).map((r) => JSON.parse(r.json));
}

// ---------- drafts ----------

const pendingDrafts = new Map<string, LocalRecord>();
let timer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 300;

function writeDraftNow(record: LocalRecord): void {
  run(
    `INSERT INTO drafts (id, record_type, json, updated_at, dirty) VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at, dirty = 1`,
    [record.id, record.recordType, JSON.stringify(record), record.updatedAt],
  );
}

/** Called on every field change. Debounced; never loses the last value (see flushDrafts). */
export function saveDraft(record: LocalRecord): void {
  pendingDrafts.set(record.id, record);
  if (timer) clearTimeout(timer);
  timer = setTimeout(flushDrafts, DEBOUNCE_MS);
}

/** Write every pending draft to disk now. */
export function flushDrafts(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (pendingDrafts.size === 0) return;
  const records = [...pendingDrafts.values()];
  pendingDrafts.clear();
  tx(() => records.forEach(writeDraftNow));
}

/** Write a draft immediately, skipping the debounce (used when a record is first created). */
export function saveDraftNow(record: LocalRecord): void {
  pendingDrafts.delete(record.id);
  writeDraftNow(record);
}

const comparable = (r: LocalRecord) => JSON.stringify({ ...r, rev: 0, updatedAt: '' });

/** Turn the draft into the next rev. Returns the new rev, or null if nothing changed. */
export function seal(id: string): number | null {
  flushDrafts();
  let sealedRev: number | null = null;
  tx(() => {
    const draft = first<DraftRow>('SELECT * FROM drafts WHERE id = ? AND dirty = 1', [id]);
    if (!draft) return;
    const record = JSON.parse(draft.json) as LocalRecord;
    const prev = getSealed(id);
    if (prev && comparable(prev) === comparable(record)) {
      run('UPDATE drafts SET dirty = 0 WHERE id = ?', [id]);
      return;
    }
    const rev = (prev?.rev ?? 0) + 1;
    const sealed = { ...record, rev };
    run('INSERT INTO record_revs (id, rev, record_type, json, saved_at) VALUES (?, ?, ?, ?, ?)', [
      id,
      rev,
      sealed.recordType,
      JSON.stringify(sealed),
      nowIso(),
    ]);
    run('UPDATE drafts SET json = ?, dirty = 0 WHERE id = ?', [JSON.stringify(sealed), id]);
    sealedRev = rev;
  });
  return sealedRev;
}

// ---------- fresh records ("Add animal" pressed, nothing entered yet) ----------
// A new animal starts as a draft only. Until someone enters something it is "fresh": leaving it (Back, Done, a
// crash) throws the empty draft away, so the "not with HQ" counter only counts animals that hold data. It was
// never sealed, so no rev is ever deleted (record_revs stays append-only).

const freshKey = (id: string) => `fresh:${id}`;

/** Write a brand-new record as a fresh draft (not sealed, not counted until something is entered). */
export function createFreshDraft(record: LocalRecord): void {
  saveDraftNow(record);
  run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [freshKey(record.id), '1']);
}

export function isFresh(id: string): boolean {
  return !!first<{ value: string }>('SELECT value FROM meta WHERE key = ?', [freshKey(id)]);
}

/** The first real entry: from now on the record is kept and sealed like any other. */
export function clearFresh(id: string): void {
  run('DELETE FROM meta WHERE key = ?', [freshKey(id)]);
}

/** Leaving a record: seal it, or drop it if it is still fresh and was never sealed. */
export function sealOrDiscard(id: string): number | null {
  flushDrafts();
  if (isFresh(id) && latestRev(id) === 0) {
    run('DELETE FROM drafts WHERE id = ?', [id]);
    clearFresh(id);
    return null;
  }
  clearFresh(id);
  return seal(id);
}

/** Seal every unsealed draft: on app start (crash recovery) and before making a bundle. Fresh empty animals
 * are dropped, not sealed. */
export function sealAll(): number {
  flushDrafts();
  const ids = all<{ id: string }>('SELECT id FROM drafts WHERE dirty = 1').map((r) => r.id);
  return ids.filter((id) => sealOrDiscard(id) !== null).length;
}

/** Flush typed values the moment the app leaves the foreground. */
AppState.addEventListener('change', (state) => {
  if (state !== 'active') flushDrafts();
});
