// The field notebook (Jack, Sat 18:00; design pick 4C): what the species pack already knows, in plain words.
// Real data only: trait ranges with their sources, size ranges, the pack's taxonomy note, and its CC-licensed
// photos with credit. No invented descriptions; guide text the pack doesn't carry yet is simply not shown.
import type { SpeciesPack, Taxon, TaxonPhoto, TraitKey, TraitRange } from '@sciworks/shared';

const COUNT_LABEL: Partial<Record<TraitKey, string>> = {
  dorsalRowsMidbody: 'Midbody scale rows',
  ventrals: 'Ventrals',
  subcaudals: 'Subcaudals',
};
const CAT_LABEL: Partial<Record<TraitKey, string>> = { analPlate: 'Anal plate', keeled: 'Dorsal scales', loreal: 'Loreal scale', pupil: 'Pupil' };

export const genus = (t: Taxon) => t.scientificName.split(' ')[0] ?? t.scientificName;

export function photoOf(t: Taxon): TaxonPhoto | undefined {
  return t.photos?.find((p) => p.url || p.file);
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

/** Side by side, trait by trait; `differ` marks a count that does not overlap (a real way to tell them apart). */
export function compareRows(a: Taxon, b: Taxon): { label: string; a: string; b: string; differ: boolean }[] {
  const keys: TraitKey[] = ['dorsalRowsMidbody', 'ventrals', 'subcaudals', 'analPlate', 'pupil', 'keeled', 'loreal'];
  const rows: { label: string; a: string; b: string; differ: boolean }[] = [];
  for (const k of keys) {
    const la = traitLines(a).find((x) => x.label === (COUNT_LABEL[k] ?? CAT_LABEL[k]));
    const lb = traitLines(b).find((x) => x.label === (COUNT_LABEL[k] ?? CAT_LABEL[k]));
    if (!la && !lb) continue;
    const differ = COUNT_LABEL[k]
      ? !!pooledRange(a, k) && !!pooledRange(b, k) && !overlap(pooledRange(a, k), pooledRange(b, k))
      : !!la && !!lb && !la.text.split(' or ').some((v) => lb.text.split(' or ').includes(v));
    rows.push({ label: (COUNT_LABEL[k] ?? CAT_LABEL[k])!, a: la?.text ?? 'no data', b: lb?.text ?? 'no data', differ });
  }
  // Sizes only side by side when they measure the same thing (an SVL is never set against a total length).
  const labels = [...new Set([...sizeLines(a), ...sizeLines(b)].map((x) => x.label))];
  for (const label of labels) {
    rows.push({
      label,
      a: sizeLines(a).find((x) => x.label === label)?.text ?? 'no data',
      b: sizeLines(b).find((x) => x.label === label)?.text ?? 'no data',
      differ: false,
    });
  }
  return rows;
}
