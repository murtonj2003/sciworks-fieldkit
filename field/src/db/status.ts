// Where each record is on its way to HQ, in three tiers (Jack, Sat 18:00; design pick 2B):
//   'phone' (red tint)  — only on this phone: never sent, or changed since the last Send to HQ
//   'sent'  (amber)     — its latest version went out in a Send to HQ bundle; HQ hasn't confirmed it yet
//   'hq'    (green)     — HQ's receipt covers its latest version
import { first, all } from './db';
import { receiptRev } from './feedback';
import { isFresh, latestRev } from './records';

export type UploadTier = 'phone' | 'sent' | 'hq';

export function uploadTier(id: string): UploadTier {
  const dirty = !!first<{ id: string }>('SELECT id FROM drafts WHERE id = ? AND dirty = 1', [id]);
  const latest = latestRev(id);
  if (dirty || latest === 0) return 'phone';
  if (receiptRev(id) >= latest) return 'hq';
  const sent = first<{ rev: number }>('SELECT MAX(rev) AS rev FROM sent_revs WHERE id = ?', [id])?.rev ?? 0;
  return sent >= latest ? 'sent' : 'phone';
}

/** Counts for the strip on Home: every record on the phone (an empty new animal is not a record yet). */
export function tierCounts(): Record<UploadTier, number> {
  const ids = new Set([
    ...all<{ id: string }>('SELECT DISTINCT id FROM record_revs').map((r) => r.id),
    ...all<{ id: string }>('SELECT id FROM drafts WHERE dirty = 1').map((r) => r.id),
  ]);
  const counts: Record<UploadTier, number> = { phone: 0, sent: 0, hq: 0 };
  for (const id of ids) {
    if (isFresh(id) && latestRev(id) === 0) continue;
    counts[uploadTier(id)] += 1;
  }
  return counts;
}
