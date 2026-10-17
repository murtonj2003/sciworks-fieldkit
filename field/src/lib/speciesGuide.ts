// The field notebook (Jack, Sat 18:00; design pick 4C): what the species pack already knows, in plain words.
// Real data only: trait ranges with their sources, size ranges, the pack's taxonomy note, and its CC-licensed
// photos with credit. No invented descriptions; guide text the pack doesn't carry yet is simply not shown.
import type { SpeciesPack, Taxon, TaxonPhoto, TraitKey, TraitRange } from '@sciworks/shared';

import type { IconName } from '@/components/sprite';

const COUNT_LABEL: Partial<Record<TraitKey, string>> = {
  dorsalRowsMidbody: 'Midbody scale rows',
  ventrals: 'Ventrals',
  subcaudals: 'Subcaudals',
};
const CAT_LABEL: Partial<Record<TraitKey, string>> = { analPlate: 'Anal plate', keeled: 'Dorsal scales', loreal: 'Loreal scale', pupil: 'Pupil' };

export const genus = (t: Taxon) => t.scientificName.split(' ')[0] ?? t.scientificName;

/** What a value says when the pack has nothing for that trait (muted on screen, never dressed as a value). */
export const NO_DATA = 'Not in the pack';

/** A small line icon per trait (comp 4C's notebook rows: eye, scale grid, ruler…). */
const TRAIT_ICON: Record<string, IconName> = {
  'Midbody scale rows': 'dots',
  Ventrals: 'ventrals',
  Subcaudals: 'tail',
  'Anal plate': 'plate',
  'Dorsal scales': 'scales',
  'Loreal scale': 'scales',
  Pupil: 'eye',
  'Snout–vent length': 'ruler',
  'Total length': 'ruler',
  Mass: 'info',
  Size: 'ruler',
};
export const traitIcon = (label: string): IconName => TRAIT_ICON[label] ?? 'info';

export function photoOf(t: Taxon): TaxonPhoto | undefined {
  return t.photos?.find((p) => p.url || p.file);
}

/** Where a species' photo comes from, best first: the one saved from the HQ bundle (offline), then the pack's
 * online link. Each comes with the credit line that must show beside it. */
export function photoChoices(t: Taxon, saved: { credit: string } | undefined): ({ kind: 'saved'; credit: string } | { kind: 'online'; credit: string; url: string })[] {
  const out: ({ kind: 'saved'; credit: string } | { kind: 'online'; credit: string; url: string })[] = [];
  if (saved) out.push({ kind: 'saved', credit: saved.credit });
  const p = photoOf(t);
  if (p?.url) out.push({ kind: 'online', credit: `${p.rightsHolder} · ${licenceShort(p.licence)}`, url: p.url });
  return out;
}

/** "CC BY 4.0", "CC0" from a licence URL. */
export function licenceShort(url: string): string {
  if (/publicdomain\/zero/.test(url)) return 'CC0';
  const m = /licenses\/([a-z-]+)\/([\d.]+)/.exec(url);
  return m ? `CC ${m[1]!.toUpperCase()} ${m[2]}` : url;
}

const span = (r?: { min?: number; max?: number }) =>
  !r ? '' : r.min !== undefined && r.max !== undefined ? (r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`) : r.max !== undefined ? `up to ${r.max}` : `from ${r.min}`;

const SEX_WORD: Record<TraitRange['sex'], string> = { pooled: '', male: 'males', female: 'females' };

/** One entry per trait in the pack; per-sex ranges on their own lines: "170–193 (males)\n169–194 (females)". */
export function traitLines(t: Taxon): { label: string; text: string }[] {
  const out: { label: string; text: string }[] = [];
  const by = new Map<TraitKey, TraitRange[]>();
  for (const tr of t.traits) by.set(tr.trait, [...(by.get(tr.trait) ?? []), tr]);
  for (const [key, list] of by) {
    if (COUNT_LABEL[key]) {
      const text = list.map((tr) => `${span(tr.range)}${tr.sex !== 'pooled' ? ` (${SEX_WORD[tr.sex]})` : ''}`).join('\n');
      out.push({ label: COUNT_LABEL[key]!, text });
    } else if (CAT_LABEL[key]) {
      out.push({ label: CAT_LABEL[key]!, text: [...new Set(list.flatMap((tr) => tr.values ?? []))].join(' or ') });
    }
  }
  return out;
}

export function sizeLines(t: Taxon): { label: string; text: string }[] {
  const r = t.sizeRanges;
  if (!r) return [];
  const out: { label: string; text: string }[] = [];
  if (r.svlMm) out.push({ label: 'Snout–vent length', text: `${span(r.svlMm)} mm` });
  if (r.totalLengthMm) out.push({ label: 'Total length', text: `${span(r.totalLengthMm)} mm` });
  if (r.massG) out.push({ label: 'Mass', text: `${span(r.massG)} g` });
  return out;
}

/** Where the numbers came from (the pack cites every value). */
export function sourceHosts(t: Taxon): string[] {
  const urls = [...t.traits.map((tr) => tr.source), ...(t.sizeSources ?? []).map((s) => s.source)];
  return [...new Set(urls.map((u) => /^https?:\/\/(?:www\.)?([^/]+)/.exec(u)?.[1] ?? u))];
}

const pooledRange = (t: Taxon, key: TraitKey) => {
  const rs = t.traits.filter((tr) => tr.trait === key && tr.range).map((tr) => tr.range!);
  if (rs.length === 0) return null;
  return { min: Math.min(...rs.map((r) => r.min ?? -Infinity)), max: Math.max(...rs.map((r) => r.max ?? Infinity)) };
};
const overlap = (a: { min: number; max: number } | null, b: { min: number; max: number } | null) => !!a && !!b && a.min <= b.max && b.min <= a.max;

/** Species in the pack easily confused with this one: same genus, or overlapping scale counts. */
export function lookAlikes(t: Taxon, pack: SpeciesPack, limit = 3): Taxon[] {
  return pack.taxa
    .filter((o) => o.taxonId !== t.taxonId)
    .map((o) => {
      let score = 0;
      if (genus(o) === genus(t)) score += 3;
      if (o.family && o.family === t.family) score += 1;
      if (overlap(pooledRange(o, 'dorsalRowsMidbody'), pooledRange(t, 'dorsalRowsMidbody'))) score += 2;
      if (overlap(pooledRange(o, 'ventrals'), pooledRange(t, 'ventrals'))) score += 1;
      return { o, score };
    })
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score || a.o.scientificName.localeCompare(b.o.scientificName))
    .slice(0, limit)
    .map((x) => x.o);
}

export type CompareRow = { label: string; icon: IconName; a: string; b: string; differ: boolean };
const SIZE_SHORT: Record<string, string> = { 'Snout–vent length': 'SVL', 'Total length': 'Total length', Mass: 'Mass' };

/** Side by side, trait by trait; `differ` marks a count that does not overlap (a real way to tell them apart). */
export function compareRows(a: Taxon, b: Taxon): CompareRow[] {
  const keys: TraitKey[] = ['dorsalRowsMidbody', 'ventrals', 'subcaudals', 'analPlate', 'pupil', 'keeled', 'loreal'];
  const rows: CompareRow[] = [];
  for (const k of keys) {
    const la = traitLines(a).find((x) => x.label === (COUNT_LABEL[k] ?? CAT_LABEL[k]));
    const lb = traitLines(b).find((x) => x.label === (COUNT_LABEL[k] ?? CAT_LABEL[k]));
    if (!la && !lb) continue;
    const differ = COUNT_LABEL[k]
      ? !!pooledRange(a, k) && !!pooledRange(b, k) && !overlap(pooledRange(a, k), pooledRange(b, k))
      : !!la && !!lb && !la.text.split(' or ').some((v) => lb.text.split(' or ').includes(v));
    const label = (COUNT_LABEL[k] ?? CAT_LABEL[k])!;
    rows.push({ label, icon: traitIcon(label), a: la?.text ?? NO_DATA, b: lb?.text ?? NO_DATA, differ });
  }
  // Sizes in one row only when they measure the same thing (an SVL is never set against a total length); any
  // others share a "Size" row where each side names its own measure.
  const sa = sizeLines(a);
  const sb = sizeLines(b);
  const same = sa.filter((x) => sb.some((y) => y.label === x.label));
  for (const x of same) rows.push({ label: x.label, icon: 'ruler', a: x.text, b: sb.find((y) => y.label === x.label)!.text, differ: false });
  const ra = sa.filter((x) => !same.some((y) => y.label === x.label));
  const rb = sb.filter((x) => !same.some((y) => y.label === x.label));
  const named = (list: typeof sa) => list.map((x) => `${SIZE_SHORT[x.label] ?? x.label} ${x.text}`).join('\n');
  if (ra.length || rb.length) rows.push({ label: 'Size', icon: 'ruler', a: named(ra) || NO_DATA, b: named(rb) || NO_DATA, differ: false });
  return rows;
}

/** "170–193 (males)" → { value: "170–193", sex: "males" }, so a chip holds the number and the sex sits beside it. */
export function splitSex(line: string): { value: string; sex?: string } {
  const m = /^(.*?) \((males|females)\)$/.exec(line);
  return m ? { value: m[1]!, sex: m[2] } : { value: line };
}

const abbr = (t: Taxon) => {
  const [g, sp] = t.scientificName.split(' ');
  return sp && g ? `${g[0]}. ${sp}` : t.scientificName;
};
const spanOf = (r: { min: number; max: number } | null) =>
  r ? span({ ...(Number.isFinite(r.min) ? { min: r.min } : {}), ...(Number.isFinite(r.max) ? { max: r.max } : {}) }) : '';

/** The first real difference between a look-alike and this species, naming both, e.g. "Ventrals 131–156
 * (L. ornata 169–194)". Counts are compared over both sexes together, as `compareRows` does. */
export function firstDifference(self: Taxon, other: Taxon): string | null {
  for (const k of ['dorsalRowsMidbody', 'ventrals', 'subcaudals'] as TraitKey[]) {
    const a = pooledRange(self, k);
    const b = pooledRange(other, k);
    if (a && b && !overlap(a, b)) return `${COUNT_LABEL[k]} ${spanOf(b)} (${abbr(self)} ${spanOf(a)})`;
  }
  const r = compareRows(self, other).find((x) => x.differ);
  return r ? `${r.label}: ${r.b} (${abbr(self)} ${r.a})` : null;
}
