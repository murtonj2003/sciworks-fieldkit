// The Team Lead's offline form changes (SHARED-CONTRACT §4 Overlay). Every change makes a new overlay rev;
// old revs are kept. Core fields can only be changed where HQ allowed it (`teamCan`, inside `limits`).
// A field the Team Lead adds works at once and raises a 'promote-team-field' request to HQ.
import type { ChangeRequest, FieldDef, Overlay, OverlayChange, Person, Template, Unit } from '@sciworks/shared';

import { teamMay } from './form';

export function startOverlay(template: Template, teamId: string, person: Person, deviceId: string, at: string): Overlay {
  return {
    templateId: template.templateId,
    coreVersion: template.coreVersion,
    teamId,
    overlayRev: 0,
    changes: [],
    addedFields: [],
    updatedAt: at,
    updatedBy: person.personId,
    deviceId,
  };
}

function bumped(o: Overlay, person: Person, deviceId: string, at: string, coreVersion: number): Overlay {
  return { ...o, overlayRev: o.overlayRev + 1, coreVersion, updatedAt: at, updatedBy: person.personId, deviceId };
}

/** Returns an error in plain words, or null if HQ allows this change. */
export function checkChange(field: FieldDef, what: OverlayChange['what'], value: unknown): string | null {
  if (!teamMay(field, what)) return `HQ doesn't let teams change "${field.label}" this way. Send a request instead.`;
  if (what === 'range') {
    const r = value as { min?: number; max?: number };
    const { minFloor, maxCeiling } = field.limits ?? {};
    if (r.min !== undefined && r.max !== undefined && r.min > r.max) return 'The lowest value must be below the highest.';
    if (r.min !== undefined && minFloor !== undefined && r.min < minFloor) return `HQ's limit: no lower than ${minFloor}.`;
    if (r.max !== undefined && maxCeiling !== undefined && r.max > maxCeiling) return `HQ's limit: no higher than ${maxCeiling}.`;
  }
  if (what === 'choices-subset' && Array.isArray(value) && value.length === 0) return 'Keep at least one choice.';
  return null;
}

export function withChange(
  o: Overlay,
  change: Omit<OverlayChange, 'at' | 'by'>,
  person: Person,
  deviceId: string,
  at: string,
  coreVersion: number,
): Overlay {
  const next = bumped(o, person, deviceId, at, coreVersion);
  return { ...next, changes: [...o.changes, { ...change, at, by: person.personId }] };
}

/** 'Number of individuals' → 'numberOfIndividuals', made unique against existing keys. */
export function keyFromLabel(label: string, taken: Set<string>): string {
  const words = label
    .normalize('NFKD')
    .replace(/[^\w\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
  let base = words.map((w, i) => (i === 0 ? w : w[0]!.toUpperCase() + w.slice(1))).join('') || 'teamField';
  if (/^\d/.test(base)) base = `f${base}`;
  let key = base;
  for (let i = 2; taken.has(key); i++) key = `${base}${i}`;
  return key;
}

/** Choice codes are lowercase-kebab (SHARED-CONTRACT §1): 'Leaf litter' → 'leaf-litter'. */
export function codeFromLabel(label: string): string {
  return (
    label
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-') || 'other'
  );
}

export interface NewTeamField {
  label: string;
  type: 'text' | 'number' | 'choice';
  unit?: Unit;
  choices?: string[];
  recordType: 'survey' | 'encounter';
}

export function teamFieldDef(input: NewTeamField, template: Template, overlay: Overlay): FieldDef {
  const taken = new Set([...template.fields.map((f) => f.key), ...overlay.addedFields.map((f) => f.key)]);
  const key = keyFromLabel(input.label, taken);
  const choices = input.type === 'choice' ? (input.choices ?? []).map((c) => c.trim()).filter(Boolean) : undefined;
  return {
    key,
    path: `teamFields.${key}`,
    recordType: input.recordType,
    label: input.label.trim(),
    type: input.type,
    tier: 'free',
    origin: 'team',
    group: 'extras',
    order: 100 + overlay.addedFields.length,
    addedInCore: template.coreVersion,
    ...(input.unit ? { unit: input.unit } : {}),
    ...(choices ? { choices: choices.map((label) => ({ code: codeFromLabel(label), label })) } : {}),
  };
}

export function withAddedField(o: Overlay, def: FieldDef, person: Person, deviceId: string, at: string, coreVersion: number): Overlay {
  const next = bumped(o, person, deviceId, at, coreVersion);
  return { ...next, addedFields: [...o.addedFields, def] };
}

export function promoteRequest(def: FieldDef, template: Template, person: Person, deviceId: string, at: string, id: string): ChangeRequest {
  const unit = def.unit ? ` (${def.unit === 'degC' ? '°C' : def.unit === 'pct' ? '%' : def.unit})` : '';
  return {
    changeRequestId: id,
    teamId: person.teamId,
    createdBy: person.personId,
    deviceId,
    createdAt: at,
    templateId: template.templateId,
    coreVersion: template.coreVersion,
    kind: 'promote-team-field',
    fieldKey: def.key,
    proposal: `Add '${def.label}${unit}' to the core form`,
    reason: `Added offline by ${person.name} (${person.teamId}); it is already in use on this team's phones.`,
  };
}
