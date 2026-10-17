// The typed-coordinate rules, as plain functions (the LocationEntry screen only draws them):
// - the record always matches the screen: an empty or unreadable box stores no point;
// - a person's choice (Use this / Keep as typed / Override / Re-take) survives a later accuracy change;
// - a point that was moved (a suggestion, or an HQ correction) keeps `original` and is shown where it is now;
// - distance along is filled only from a trusted point, and cleared when the point stops being trusted.
// Never auto-corrects: these only ever apply what the person chose.
import {
  checkCoordinate,
  measureAgainstTransect,
  parseTyped,
  type CoordBand,
  type CoordCheck,
  type CoordFormat,
  type CoordSuggestion,
  type Location,
  type Project,
  type Transect,
} from '@sciworks/shared';

export interface EntryContext {
  transect: Transect;
  project: Project;
  personId: string;
  now: () => string;
  previousChainageM?: number;
  typedDistanceM?: number;
}

export interface LocationChange {
  location: Location | undefined;
  /** What to do with an auto-filled distance along: set it, clear it, or leave it. A typed one is never touched. */
  distance: { action: 'set'; valueM: number } | { action: 'clear' } | { action: 'keep' };
}

const accuracyPart = (a: number | undefined) => (a && a > 0 ? { accuracyM: a } : {});

/** True when the stored point is not where the typed text puts it (a used suggestion or an HQ correction). */
export function isMoved(loc: Location | undefined): boolean {
  return !!loc?.original;
}

function typedCheck(raw: string, format: CoordFormat, accuracyM: number | undefined, ctx: EntryContext) {
  const p = raw.trim() ? parseTyped(raw, format) : null;
  if (!p || 'error' in p) return null;
  return {
    point: p,
    check: checkCoordinate(
      { ...p, accuracyM, typed: { raw, format }, previousChainageM: ctx.previousChainageM, typedDistanceM: ctx.typedDistanceM },
      ctx.transect,
      ctx.project,
    ),
  };
}

/** Typing, a format change or an accuracy change. */
export function onEntryChange(
  prev: Location | undefined,
  raw: string,
  format: CoordFormat,
  accuracyM: number | undefined,
  ctx: EntryContext,
  retaking = false,
): LocationChange {
  const t = typedCheck(raw, format, accuracyM, ctx);
  if (!t) return { location: undefined, distance: { action: 'clear' } };

  // Same text, same format: only the accuracy changed. Keep what the person already chose.
  const decision = prev?.typed?.raw === raw && prev.typed.format === format ? prev.check.decision : undefined;
  if (decision && prev) {
    const check: CoordCheck = { ...t.check, decision };
    if (isMoved(prev)) {
      const { accuracyM: _old, ...rest } = prev;
      return { location: { ...rest, ...accuracyPart(accuracyM), check }, distance: { action: 'keep' } };
    }
    return {
      location: { lat: t.point.lat, lon: t.point.lon, ...accuracyPart(accuracyM), source: 'typed', typed: { raw, format }, check },
      distance: { action: 'keep' },
    };
  }

  const check: CoordCheck =
    retaking && t.check.band === 'green' ? { ...t.check, decision: { kind: 're-taken', by: ctx.personId, at: ctx.now() } } : t.check;
  return {
    location: { lat: t.point.lat, lon: t.point.lon, ...accuracyPart(accuracyM), source: 'typed', typed: { raw, format }, check },
    distance: check.band === 'green' ? { action: 'set', valueM: Math.round(check.chainageM) } : { action: 'clear' },
  };
}

/** "Use this": the point moves to the suggestion; what was typed and where it put the point are kept. */
export function acceptSuggestion(
  raw: string,
  format: CoordFormat,
  accuracyM: number | undefined,
  sg: CoordSuggestion,
  ctx: EntryContext,
): LocationChange {
  const t = typedCheck(raw, format, accuracyM, ctx);
  if (!t) return { location: undefined, distance: { action: 'clear' } };
  return {
    location: {
      lat: sg.lat,
      lon: sg.lon,
      ...accuracyPart(accuracyM),
      source: 'typed',
      typed: { raw, format },
      original: { lat: t.point.lat, lon: t.point.lon },
      check: { ...t.check, decision: { kind: 'accepted-suggestion', suggestionKind: sg.kind, by: ctx.personId, at: ctx.now() } },
    },
    distance: { action: 'set', valueM: Math.round(sg.chainageM) },
  };
}

/** "Keep as typed" or "Override with a reason": the typed point stays, with the person's choice recorded. */
export function keepTyped(
  raw: string,
  format: CoordFormat,
  accuracyM: number | undefined,
  kind: 'kept-original' | 'override',
  reason: string | undefined,
  ctx: EntryContext,
): LocationChange {
  const t = typedCheck(raw, format, accuracyM, ctx);
  if (!t) return { location: undefined, distance: { action: 'clear' } };
  return {
    location: {
      lat: t.point.lat,
      lon: t.point.lon,
      ...accuracyPart(accuracyM),
      source: 'typed',
      typed: { raw, format },
      check: { ...t.check, decision: { kind, by: ctx.personId, at: ctx.now(), ...(kind === 'override' && reason ? { reason } : {}) } },
    },
    distance: { action: 'set', valueM: Math.round(t.check.chainageM) },
  };
}

/** Where a stored point actually is now, for the screen: band and distances of the stored lat/lon. */
export function whereNow(loc: Location, ctx: Pick<EntryContext, 'transect' | 'project'>): { offsetM: number; chainageM: number; band: CoordBand } {
  const m = measureAgainstTransect(loc.lat, loc.lon, ctx.transect);
  const tol = loc.check.toleranceM;
  const band: CoordBand = m.offsetM <= tol ? 'green' : m.offsetM <= tol * ctx.project.coordCheck.amberMultiplier ? 'amber' : 'red';
  return { offsetM: m.offsetM, chainageM: m.chainageM, band };
}

/** Applies a LocationChange's distance rule to the record's distanceAlongM. A typed distance is the person's: kept. */
export function nextDistance(
  current: { value: number; source: 'auto' | 'typed' } | undefined,
  change: LocationChange['distance'],
): { value: number; source: 'auto' | 'typed' } | undefined {
  if (current?.source === 'typed') return current;
  if (change.action === 'set') return { value: change.valueM, source: 'auto' };
  if (change.action === 'clear') return undefined;
  return current;
}
