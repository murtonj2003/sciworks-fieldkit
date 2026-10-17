// The form is never hard-coded: screens render the HQ template with the team's overlay applied
// (SHARED-CONTRACT §4). Hidden fields are hidden, never removed, so no form change can destroy data.
import type { FieldDef, Overlay, OverlayChange, TeamEdit, Template } from '@sciworks/shared';

export interface EffectiveField extends FieldDef {
  /** For a 'taxon' field: the site shortlist the Team Lead chose (taxonIds). Absent = the whole pack. */
  subset?: string[];
}

export const GROUPS: { key: string; label: string }[] = [
  { key: 'start', label: 'Start' },
  { key: 'weather-start', label: 'Weather at start' },
  { key: 'herp', label: 'Herp conditions' },
  { key: 'animal', label: 'Animal' },
  { key: 'measurements', label: 'Measurements' },
  { key: 'location', label: 'Where' },
  { key: 'scales', label: 'Scale counts' },
  { key: 'extras', label: 'Extras' },
  { key: 'weather-end', label: 'Weather at finish' },
  { key: 'notes', label: 'Notes' },
];
const GROUP_RANK = new Map(GROUPS.map((g, i) => [g.key, i]));

const EDITS: TeamEdit[] = ['show-hide', 'default', 'range', 'label', 'choices-subset'];

function withinLimits(f: FieldDef, r: { min?: number; max?: number }): boolean {
  const { minFloor, maxCeiling } = f.limits ?? {};
  if (r.min !== undefined && minFloor !== undefined && r.min < minFloor) return false;
  if (r.max !== undefined && maxCeiling !== undefined && r.max > maxCeiling) return false;
  return true;
}

/** Latest change per (fieldKey, what), in order. */
export function latestChanges(overlay: Overlay | null): Map<string, OverlayChange> {
  const m = new Map<string, OverlayChange>();
  for (const c of overlay?.changes ?? []) m.set(`${c.fieldKey}|${c.what}`, c);
  return m;
}

/** Can the Team Lead make this change? Core and team fields only within `teamCan`; team-added fields freely. */
export function teamMay(f: FieldDef, what: TeamEdit): boolean {
  return f.origin === 'team' || (f.teamCan ?? []).includes(what);
}

function apply(f: FieldDef, latest: Map<string, OverlayChange>): EffectiveField {
  const g: EffectiveField = { ...f };
  for (const what of EDITS) {
    const c = latest.get(`${f.key}|${what}`);
    if (!c || !teamMay(f, what)) continue;
    if (what === 'show-hide') g.hidden = Boolean(c.value);
    else if (what === 'default') g.default = c.value;
    else if (what === 'label' && typeof c.value === 'string' && c.value.trim()) g.label = c.value;
    else if (what === 'range') {
      const r = c.value as { min?: number; max?: number };
      if (r && withinLimits(f, r)) {
        g.min = r.min;
        g.max = r.max;
      }
    } else if (what === 'choices-subset' && Array.isArray(c.value)) {
      const keep = c.value as string[];
      if (f.type === 'taxon') g.subset = keep;
      else if (f.choices) g.choices = f.choices.filter((ch) => keep.includes(ch.code));
    }
  }
  return g;
}

export function effectiveFields(
  template: Template,
  overlay: Overlay | null,
  recordType: FieldDef['recordType'],
): EffectiveField[] {
  const latest = latestChanges(overlay);
  const base = template.fields.filter((f) => f.recordType === recordType);
  // An overlay made against another core version still applies wherever the field exists (§7.4 step 3).
  const added = (overlay?.addedFields ?? []).filter(
    (f) => f.recordType === recordType && !base.some((b) => b.key === f.key),
  );
  return [...base, ...added]
    .map((f) => apply(f, latest))
    .sort((a, b) => (GROUP_RANK.get(a.group) ?? 99) - (GROUP_RANK.get(b.group) ?? 99) || a.order - b.order);
}

export function byGroup(fields: EffectiveField[], groups: string[]): EffectiveField[] {
  return fields.filter((f) => groups.includes(f.group) && !f.hidden);
}

// ---------- reading and writing a value by its template path ----------

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** Immutable set. `undefined` removes the key (an empty box stores nothing, never a made-up value). */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split('.');
  const src = (obj ?? {}) as Record<string, unknown>;
  const copy: Record<string, unknown> = { ...src };
  if (rest.length === 0) {
    if (value === undefined) delete copy[head!];
    else copy[head!] = value;
  } else {
    const child = setPath(src[head!] as Record<string, unknown> | undefined, rest.join('.'), value);
    if (child && Object.keys(child).length > 0) copy[head!] = child;
    else delete copy[head!];
  }
  return copy as T;
}

/** Template defaults for a new record (only where nothing is set yet). Measurement defaults pick the method
 * in the UI and are stored only once a value is typed. */
export function withDefaults<T>(record: T, fields: EffectiveField[]): T {
  let r = record;
  for (const f of fields) {
    if (f.default === undefined || f.type === 'measurement' || f.hidden) continue;
    if (getPath(r, f.path) === undefined) r = setPath(r, f.path, f.default);
  }
  return r;
}

/** "Check?" text for a number outside the field's soft range. Never blocks. */
export function rangeHint(f: EffectiveField, value: number | undefined): string | null {
  if (value === undefined || Number.isNaN(value)) return null;
  const unit = f.unit ? ` ${UNIT_LABEL[f.unit] ?? f.unit}` : '';
  if (f.max !== undefined && value > f.max) return `Check? Above the usual ${f.max}${unit}.`;
  if (f.min !== undefined && value < f.min) return `Check? Below the usual ${f.min}${unit}.`;
  return null;
}

export const UNIT_LABEL: Record<string, string> = { mm: 'mm', g: 'g', m: 'm', degC: '°C', pct: '%', h: 'h' };

/** Instrument divisions for the scales in the demo template (Pesola 10 g → 0.1 g, 100 g → 1 g, 500 g → 5 g). */
export const SCALE_PRECISION_G: Record<string, number> = { 'pesola-10': 0.1, 'pesola-100': 1, 'pesola-500': 5 };
