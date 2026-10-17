// Satellite pictures from HQ (SHARED-CONTRACT changelog, Sat 16:50): saved in the documents folder, drawn under
// the transect maps. Only the newest picture per basemapId is kept; its details live in the setup table.
import type { Basemap, Code } from '@sciworks/shared';
import { Directory, File, Paths } from 'expo-file-system';

import { all, first } from './db';
import { putSetupIfChanged, type SetupKey } from './setup';

export interface StoredBasemap extends Basemap {
  /** Relative to the documents folder, e.g. 'basemaps/la-selva-s2-2021-2da42dc59cd7.jpg'. */
  path: string;
  /** When HQ made the bundle it came in: a picture from an older bundle never replaces a newer one. */
  bundleCreatedAt: string;
}

const key = (id: Code): SetupKey => `basemap:${id}`;

function basemapsDir(): Directory {
  const dir = new Directory(Paths.document, 'basemaps');
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export function basemapFile(b: StoredBasemap): File {
  return new File(Paths.document, b.path);
}

function current(id: Code): StoredBasemap | null {
  const row = first<{ json: string }>('SELECT json FROM setup WHERE key = ? ORDER BY version DESC LIMIT 1', [key(id)]);
  return row ? (JSON.parse(row.json) as StoredBasemap) : null;
}

/**
 * Saves each picture that came with checked bytes (temp name, then rename). Returns "what changed" lines.
 * Applying the same bundle twice changes nothing.
 */
export function saveBasemaps(list: Basemap[], files: Record<Code, Uint8Array>, source: string, bundleCreatedAt: string): string[] {
  const changes: string[] = [];
  for (const b of list) {
    const bytes = files[b.basemapId];
    if (!bytes) continue; // failed its checksum: readBundle already named it in the warnings
    const prev = current(b.basemapId);
    if (prev && prev.bundleCreatedAt > bundleCreatedAt) continue; // we already hold a newer one
    const dir = basemapsDir();
    const name = `${b.basemapId}-${b.sha256.slice(0, 12)}.jpg`;
    const target = new File(dir, name);
    if (!target.exists) {
      const tmp = new File(dir, `${name}.tmp`);
      if (tmp.exists) tmp.delete();
      tmp.create();
      tmp.write(bytes);
      tmp.rename(name);
    }
    const stored: StoredBasemap = { ...b, path: `basemaps/${name}`, bundleCreatedAt };
    const same = prev && JSON.stringify({ ...prev, bundleCreatedAt: '' }) === JSON.stringify({ ...stored, bundleCreatedAt: '' });
    if (same) continue;
    putSetupIfChanged(key(b.basemapId), stored, source);
    if (prev && prev.path !== stored.path) {
      const old = basemapFile(prev);
      if (old.exists) old.delete();
    }
    changes.push(`${prev ? 'Satellite picture updated' : 'Satellite picture'}: ${b.name}`);
  }
  return changes;
}

/** The newest picture per basemapId whose file is on the phone. */
export function listBasemaps(): StoredBasemap[] {
  const ids = all<{ key: string }>("SELECT DISTINCT key FROM setup WHERE key LIKE 'basemap:%' ORDER BY key").map((r) => r.key.slice('basemap:'.length));
  return ids.map(current).filter((b): b is StoredBasemap => !!b && basemapFile(b).exists);
}

/** The picture cut for this transect, else one that covers its whole line. */
export function basemapFor(list: StoredBasemap[], transectId: Code, line: [number, number][]): StoredBasemap | null {
  const covers = (b: StoredBasemap) =>
    line.every(([lon, lat]) => lon >= b.bounds.lonMin && lon <= b.bounds.lonMax && lat >= b.bounds.latMin && lat <= b.bounds.latMax);
  return list.find((b) => b.transectIds?.includes(transectId)) ?? list.find(covers) ?? null;
}
