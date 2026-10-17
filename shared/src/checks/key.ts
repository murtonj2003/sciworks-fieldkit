// STUB. The trait key (pocket field guide) is owned by the Field chat: briefs/MOBILE-BRIEF.md step F6.
// Contract: SHARED-CONTRACT §8. Rules to implement:
// - match against sex-specific ranges when sex is known, otherwise pooled plus both sexes;
// - ignore subcaudals unless tailCondition is 'intact';
// - a trait the pack has no data on is 'unknown', not a mismatch;
// - always a ranked list with matched / conflicts / unknown and a checkNext, never one "answer".

import type { KeyResult, SpeciesPack } from '../types';

export const KEY_VERSION = 'trait-key@0.0.0-stub';

export function runKey(input: KeyResult['inputs'], pack: SpeciesPack): KeyResult {
  return { keyVersion: KEY_VERSION, packId: pack.packId, packVersion: pack.version, inputs: input, candidates: [] };
}
