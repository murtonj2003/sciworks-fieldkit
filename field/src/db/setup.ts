// Everything HQ sets up: project, form template, overlays, transects, species pack, credits.
// Every version ever received is kept (old records display with the form they were made with).
import type { Overlay, Project, SpeciesPack, Template, TransectCollection } from '@sciworks/shared';

import { all, first, run } from './db';
import { nowIso } from '@/lib/time';

/** Overlays are per team: 'overlay:team-b'. */
export type SetupKey = 'project' | 'template' | 'transects' | 'species-pack' | 'attribution' | `overlay:${string}` | `basemap:${string}` | `speciesPhoto:${string}`;

export const overlayKey = (teamId: string): SetupKey => `overlay:${teamId}`;

interface SetupRow {
  key: SetupKey;
  version: number;
  json: string;
  received_at: string;
  source: string;
}

export interface Versioned<T> {
  version: number;
  value: T;
  receivedAt: string;
  source: string;
}

const parse = <T>(row: SetupRow | null): Versioned<T> | null =>
  row ? { version: row.version, value: JSON.parse(row.json) as T, receivedAt: row.received_at, source: row.source } : null;

export function currentSetup<T>(key: SetupKey): Versioned<T> | null {
  return parse<T>(first<SetupRow>('SELECT * FROM setup WHERE key = ? ORDER BY version DESC LIMIT 1', [key]));
}

export function setupVersion<T>(key: SetupKey, version: number): Versioned<T> | null {
  return parse<T>(first<SetupRow>('SELECT * FROM setup WHERE key = ? AND version = ?', [key, version]));
}

export function allSetupVersions(key: SetupKey): number[] {
  return all<{ version: number }>('SELECT version FROM setup WHERE key = ? ORDER BY version', [key]).map((r) => r.version);
}

/** Store under an explicit version (template = coreVersion, overlay = overlayRev). Returns true if new. */
export function putSetupVersion(key: SetupKey, version: number, value: unknown, source: string): boolean {
  return (
    run('INSERT OR IGNORE INTO setup (key, version, json, received_at, source) VALUES (?, ?, ?, ?, ?)', [
      key,
      version,
      JSON.stringify(value),
      nowIso(),
      source,
    ]) > 0
  );
}

/** Store as a new version only if the content changed. Returns true if new. */
export function putSetupIfChanged(key: SetupKey, value: unknown, source: string): boolean {
  const cur = first<SetupRow>('SELECT * FROM setup WHERE key = ? ORDER BY version DESC LIMIT 1', [key]);
  const json = JSON.stringify(value);
  if (cur && cur.json === json) return false;
  return putSetupVersion(key, (cur?.version ?? 0) + 1, value, source);
}

export interface SetupState {
  project: Project | null;
  template: Template | null;
  overlay: Overlay | null;
  transects: TransectCollection | null;
  pack: SpeciesPack | null;
  attribution: string | null;
}

export function loadSetup(teamId: string | null): SetupState {
  return {
    project: currentSetup<Project>('project')?.value ?? null,
    template: currentSetup<Template>('template')?.value ?? null,
    overlay: teamId ? (currentSetup<Overlay>(overlayKey(teamId))?.value ?? null) : null,
    transects: currentSetup<TransectCollection>('transects')?.value ?? null,
    pack: currentSetup<SpeciesPack>('species-pack')?.value ?? null,
    attribution: currentSetup<string>('attribution')?.value ?? null,
  };
}
