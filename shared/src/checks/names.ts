// Species search that forgives misspellings and sound-alikes (Susie, 17 Oct: student scribes mishear and
// misspell species names, and decoding them costs hours at the desk). The scribe still picks from the pack;
// this only makes the right row appear when what they type is close. Used by the Field picker and by HQ to
// suggest a pack name for a provisional or free-text species.

import type { Taxon } from '../types';

export const NAME_MATCHER_VERSION = 'name-match@1.0.0';

/** Best first: the whole name, the start of it, inside it, the start of each word, then near misses. */
export type NameMatchReason = 'exact' | 'starts-with' | 'contains' | 'word-starts' | 'spelling' | 'sounds-like';

export interface TaxonMatch {
  taxon: Taxon;
  reason: NameMatchReason;
  /** Lower is better. Only useful for ordering. */
  score: number;
  /** Which name matched: the scientific name, the common name or the family. */
  matched: string;
}

/** Lower case, accents and punctuation stripped, single spaces: "B. ásper" → "b asper". */
export function normaliseName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim();
}

/**
 * A rough "how it sounds" key for Latin and English names, so a name heard and written phonetically still
 * finds the species: "kyronius" and "chironius" share a key, as do "leptodira" and "leptodeira".
 */
export function soundKey(word: string): string {
  return word
    .replace(/ph/g, 'f')
    .replace(/ch/g, 'k')
    .replace(/ck/g, 'k')
    .replace(/qu/g, 'kw')
    .replace(/q/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/c/g, 'k')
    .replace(/z/g, 's')
    .replace(/y/g, 'i')
    .replace(/h/g, '')
    .replace(/(.)\1+/g, '$1')
    .replace(/[aeiou]+/g, '*');
}

/** Edits to turn a into b: insert, delete, change one letter, or swap two neighbours (optimal string alignment). */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
    }
  }
  return d[a.length]![b.length]!;
}

/** How many slips a typed word of this length may contain. Short words must be right. */
const allowedEdits = (len: number) => (len < 4 ? 0 : len <= 5 ? 1 : len <= 9 ? 2 : 3);

const SCORE: Record<NameMatchReason, number> = { exact: 0, 'starts-with': 1, contains: 2, 'word-starts': 3, spelling: 4, 'sounds-like': 4.5 };

/** One typed word against one word of a name. Lets a half-typed word match the start of the name's word. */
function wordMatch(q: string, w: string): { reason: NameMatchReason; cost: number } | undefined {
  if (w.startsWith(q)) return { reason: 'word-starts', cost: 0 };
  const allowed = allowedEdits(q.length);
  if (allowed === 0) return undefined;
  let best = editDistance(q, w);
  for (let len = Math.max(1, q.length - 1); len <= Math.min(w.length - 1, q.length + 1); len++) {
    best = Math.min(best, editDistance(q, w.slice(0, len)));
  }
  if (best <= allowed) return { reason: 'spelling', cost: best };
  const qk = soundKey(q);
  const wk = soundKey(w);
  if (qk.length >= 3 && (wk === qk || wk.startsWith(qk))) return { reason: 'sounds-like', cost: 0 };
  return undefined;
}

function matchName(q: string, name: string, fuzzy: boolean): { reason: NameMatchReason; score: number } | undefined {
  const n = normaliseName(name);
  if (!n) return undefined;
  if (n === q) return { reason: 'exact', score: SCORE.exact };
  if (n.startsWith(q)) return { reason: 'starts-with', score: SCORE['starts-with'] };
  if (n.includes(q)) return { reason: 'contains', score: SCORE.contains };

  const words = n.split(' ');
  let reason: NameMatchReason = 'word-starts';
  let cost = 0;
  for (const qw of q.split(' ')) {
    const options = words
      .map((w) => (fuzzy ? wordMatch(qw, w) : w.startsWith(qw) ? { reason: 'word-starts' as const, cost: 0 } : undefined))
      .filter((m): m is { reason: NameMatchReason; cost: number } => m !== undefined)
      .sort((a, b) => SCORE[a.reason] + a.cost - (SCORE[b.reason] + b.cost));
    const m = options[0];
    if (!m) return undefined;
    cost += m.cost;
    if (SCORE[m.reason] > SCORE[reason]) reason = m.reason;
  }
  return { reason, score: SCORE[reason] + cost / 10 };
}

/**
 * Taxa whose scientific name, common name or family matches what was typed, best first. Misspellings and
 * sound-alikes match the scientific and common names (not the family, which would match too much). An empty
 * query returns nothing, so show the whole list instead.
 */
export function searchTaxa(query: string, taxa: Taxon[], opts: { limit?: number } = {}): TaxonMatch[] {
  const q = normaliseName(query);
  if (!q) return [];
  const out: TaxonMatch[] = [];
  for (const taxon of taxa) {
    const names: [string, boolean][] = [
      [taxon.scientificName, true],
      ...(taxon.commonName ? ([[taxon.commonName, true]] as [string, boolean][]) : []),
      ...(taxon.family ? ([[taxon.family, false]] as [string, boolean][]) : []),
    ];
    let best: TaxonMatch | undefined;
    for (const [name, fuzzy] of names) {
      const m = matchName(q, name, fuzzy);
      if (m && (!best || m.score < best.score)) best = { taxon, reason: m.reason, score: m.score, matched: name };
    }
    if (best) out.push(best);
  }
  out.sort((a, b) => a.score - b.score || a.taxon.scientificName.localeCompare(b.taxon.scientificName));
  return out.slice(0, opts.limit ?? 20);
}
