// "Check?" warnings when a measurement is outside the species pack's published range (SHARED-CONTRACT §8).
// Warns, never blocks. Says which bound and where the number came from.

import type { Encounter, Range, SpeciesPack } from '../types';

export interface RangeWarning {
  fieldPath: string;
  message: string;
}

const fmt = (n: number) => String(Math.round(n * 10) / 10).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function outside(value: number, range: Range | undefined): 'above' | 'below' | undefined {
  if (!range) return undefined;
  if (range.max !== undefined && value > range.max) return 'above';
  if (range.min !== undefined && value < range.min) return 'below';
  return undefined;
}

export function checkRanges(e: Encounter, pack: SpeciesPack): RangeWarning[] {
  const taxon = e.taxon.taxonId ? pack.taxa.find((t) => t.taxonId === e.taxon.taxonId) : undefined;
  if (!taxon?.sizeRanges) return [];
  const name = taxon.scientificName;
  const out: RangeWarning[] = [];

  const test = (fieldPath: string, label: string, value: number | undefined, unit: string, range: Range | undefined) => {
    if (value === undefined || !range) return;
    const side = outside(value, range);
    if (!side) return;
    const bound = side === 'above' ? `maximum for ${name} (${fmt(range.max!)} ${unit})` : `minimum for ${name} (${fmt(range.min!)} ${unit})`;
    out.push({ fieldPath, message: `${label} ${fmt(value)} ${unit} is ${side} this pack's ${bound}. Check?` });
  };

  test('svl', 'SVL', e.svl?.value, 'mm', taxon.sizeRanges.svlMm);
  test('mass', 'Mass', e.mass?.value, 'g', taxon.sizeRanges.massG);
  if (e.svl && e.tailLength) {
    test('tailLength', 'Total length (SVL + tail)', e.svl.value + e.tailLength.value, 'mm', taxon.sizeRanges.totalLengthMm);
  } else if (e.svl && taxon.sizeRanges.totalLengthMm?.max !== undefined && e.svl.value > taxon.sizeRanges.totalLengthMm.max) {
    // SVL alone can't exceed the species' maximum total length.
    test('svl', 'SVL', e.svl.value, 'mm', { max: taxon.sizeRanges.totalLengthMm.max });
  }
  return out;
}
