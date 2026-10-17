// The trait key: a pocket field guide (SHARED-CONTRACT §8). Owned by the Field chat (MOBILE-BRIEF F6).
// - Uses sex-specific ranges when the sex is known, otherwise pooled plus both sexes.
// - Ignores subcaudals unless tailCondition is 'intact'.
// - A trait the pack has no data on is 'unknown', never a mismatch.
// - Always a ranked list with matched / conflicts / unknown and a checkNext, never one "answer".
// It only ever suggests: the surveyor picks, and the raw counts are stored either way.

import type { KeyCandidate, KeyResult, Range, ScaleCounts, Sex, SpeciesPack, Taxon, TraitKey, TraitRange } from '../types';

export const KEY_VERSION = 'trait-key@1.0.0';

type Input = KeyResult['inputs'];

/** Order of the fast in-hand traits first, then the counts that need the animal on its back. */
export const TRAIT_ORDER: TraitKey[] = ['dorsalRowsMidbody', 'analPlate', 'keeled', 'loreal', 'pupil', 'ventrals', 'subcaudals'];

export const TRAIT_LABEL: Record<TraitKey, string> = {
  dorsalRowsMidbody: 'midbody scale rows',
  ventrals: 'ventrals',
  subcaudals: 'subcaudals',
  analPlate: 'anal plate',
  keeled: 'dorsal scales',
  loreal: 'loreal scale',
  pupil: 'pupil',
};

const COUNT_TRAITS = new Set<TraitKey>(['dorsalRowsMidbody', 'ventrals', 'subcaudals']);
/** How far outside a published range still reads as "just outside" (counts vary a little between animals). */
const NEAR: Partial<Record<TraitKey, number>> = { dorsalRowsMidbody: 0, ventrals: 3, subcaudals: 3 };
const POINTS = { match: 1, near: 0.5, unknown: 0.4, conflict: 0 } as const;

function rangesFor(taxon: Taxon, trait: TraitKey, sex: Sex | undefined): TraitRange[] {
  const all = taxon.traits.filter((t) => t.trait === trait);
  if (sex === 'male' || sex === 'female') {
    const specific = all.filter((t) => t.sex === sex);
    return specific.length ? specific : all.filter((t) => t.sex === 'pooled');
  }
  return all;
}

const fmtRange = (r: Range) =>
  r.min !== undefined && r.max !== undefined
    ? r.min === r.max
      ? `${r.min}`
      : `${r.min}–${r.max}`
    : r.min !== undefined
      ? `${r.min} or more`
      : `up to ${r.max}`;

const sexWord = (s: TraitRange['sex']) => (s === 'male' ? 'males ' : s === 'female' ? 'females ' : '');
const describe = (ranges: TraitRange[]) =>
  ranges.map((r) => (r.range ? `${sexWord(r.sex)}${fmtRange(r.range)}` : `${sexWord(r.sex)}${(r.values ?? []).join(' or ')}`)).join('; ');

const inRange = (v: number, r: Range, slack = 0) =>
  (r.min === undefined || v >= r.min - slack) && (r.max === undefined || v <= r.max + slack);

/** The traits the person entered that the key may use. */
export function usableInputs(input: Input): { trait: TraitKey; value: number | string }[] {
  const out: { trait: TraitKey; value: number | string }[] = [];
  for (const trait of TRAIT_ORDER) {
    const value = input[trait as keyof ScaleCounts];
    if (value === undefined || value === null || (value as unknown) === '') continue;
    if (trait === 'subcaudals' && input.tailCondition !== 'intact') continue;
    out.push({ trait, value: value as number | string });
  }
  return out;
}

function scoreTaxon(taxon: Taxon, input: Input): KeyCandidate {
  const used = usableInputs(input);
  const matched: string[] = [];
  const conflicts: string[] = [];
  const unknown: string[] = [];
  let points = 0;

  for (const { trait, value } of used) {
    const ranges = rangesFor(taxon, trait, input.sex);
    const label = TRAIT_LABEL[trait];
    if (ranges.length === 0) {
      unknown.push(`${label}: no data for this species in the pack`);
      points += POINTS.unknown;
      continue;
    }
    if (COUNT_TRAITS.has(trait)) {
      const v = Number(value);
      const withRange = ranges.filter((r) => r.range);
      if (withRange.length === 0) {
        unknown.push(`${label}: no count in the pack`);
        points += POINTS.unknown;
      } else if (withRange.some((r) => inRange(v, r.range!))) {
        matched.push(`${v} ${label} (pack: ${describe(withRange)})`);
        points += POINTS.match;
      } else if (withRange.some((r) => inRange(v, r.range!, NEAR[trait] ?? 0))) {
        conflicts.push(`${v} ${label} is just outside the pack's ${describe(withRange)}`);
        points += POINTS.near;
      } else {
        conflicts.push(`${v} ${label}, but the pack says ${describe(withRange)}`);
      }
    } else {
      const v = String(value);
      const withValues = ranges.filter((r) => r.values?.length);
      if (withValues.length === 0) {
        unknown.push(`${label}: no data for this species in the pack`);
        points += POINTS.unknown;
      } else if (withValues.some((r) => r.values!.includes(v))) {
        matched.push(`${label} ${v} (pack: ${describe(withValues)})`);
        points += POINTS.match;
      } else {
        conflicts.push(`${label} ${v}, but the pack says ${describe(withValues)}`);
      }
    }
  }

  return {
    taxonId: taxon.taxonId,
    scientificName: taxon.scientificName,
    ...(taxon.dangerous ? { dangerous: true } : {}),
    score: used.length ? Math.round((points / used.length) * 100) / 100 : 0,
    matched,
    conflicts,
    unknown,
  };
}

/** Pairs of candidates a trait would tell apart: ranges that don't overlap, or category values that differ. */
function splitPower(trait: TraitKey, taxa: Taxon[], sex: Sex | undefined): { pairs: number; withData: number } {
  const data = taxa
    .map((t) => rangesFor(t, trait, sex))
    .filter((rs) => rs.some((r) => r.range || r.values?.length));
  let pairs = 0;
  for (let i = 0; i < data.length; i++) {
    for (let j = i + 1; j < data.length; j++) {
      const a = data[i]!;
      const b = data[j]!;
      if (COUNT_TRAITS.has(trait)) {
        const overlap = a.some((x) =>
          b.some((y) => x.range && y.range && (x.range.max ?? Infinity) >= (y.range.min ?? -Infinity) && (y.range.max ?? Infinity) >= (x.range.min ?? -Infinity)),
        );
        if (!overlap) pairs++;
      } else {
        const av = new Set(a.flatMap((x) => x.values ?? []));
        const bv = b.flatMap((y) => y.values ?? []);
        if (!bv.some((v) => av.has(v))) pairs++;
      }
    }
  }
  return { pairs, withData: data.length };
}

export function runKey(input: Input, pack: SpeciesPack): KeyResult {
  const used = usableInputs(input);
  const ranked = pack.taxa
    .map((t) => scoreTaxon(t, input))
    .filter((c) => used.length === 0 || c.score > 0)
    .sort((a, b) => b.score - a.score || b.matched.length - a.matched.length || a.scientificName.localeCompare(b.scientificName));

  // Suggest the next trait to check among the still-likely candidates.
  const top = ranked[0]?.score ?? 0;
  const contenders = ranked.filter((c) => c.score >= top - 0.35).slice(0, 8);
  const contenderTaxa = contenders.map((c) => pack.taxa.find((t) => t.taxonId === c.taxonId)!).filter(Boolean);
  const entered = new Set(used.map((u) => u.trait));
  const open = TRAIT_ORDER.filter((t) => !entered.has(t) && !(t === 'subcaudals' && input.tailCondition && input.tailCondition !== 'intact'));
  let checkNext: TraitKey | undefined;
  let best = { pairs: 0, withData: 0 };
  for (const trait of open) {
    const p = splitPower(trait, contenderTaxa, input.sex);
    if (p.pairs > best.pairs || (p.pairs === best.pairs && p.pairs === 0 && p.withData > best.withData)) {
      best = p;
      checkNext = p.withData > 0 ? trait : checkNext;
    }
  }

  return {
    keyVersion: KEY_VERSION,
    packId: pack.packId,
    packVersion: pack.version,
    inputs: input,
    candidates: ranked,
    ...(checkNext ? { checkNext } : {}),
  };
}
