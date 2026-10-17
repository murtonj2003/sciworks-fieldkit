// Species photos from HQ (CONTRACT CHANGED, Sat 21:15): one small CC BY / CC0 photo per species, saved in the
// documents folder so the species picker and the field notebook show them in airplane mode. Same rules as the
// satellite pictures (db/basemaps.ts): only the newest photo per taxonId is kept, its details (with the credit that
// must show beside it) live in the setup table, and a photo from an older bundle never replaces a newer one.
import type { SpeciesPhoto } from '@sciworks/shared';
import { Directory, File, Paths } from 'expo-file-system';

import { all, first } from './db';
import { putSetupIfChanged, type SetupKey } from './setup';

export interface StoredSpeciesPhoto extends SpeciesPhoto {
  /** Relative to the documents folder, e.g. 'species-photos/gbif-5220796-c9216fedb59f.jpg'. */
  path: string;
  /** When HQ made the bundle it came in. */
  bundleCreatedAt: string;
}

const key = (taxonId: string): SetupKey => `speciesPhoto:${taxonId}`;
/** "gbif:5220796" → "gbif-5220796": a taxonId made safe for a file name. */
const safe = (taxonId: string) => taxonId.replace(/[^A-Za-z0-9._-]+/g, '-');

function photosDir(): Directory {
  const dir = new Directory(Paths.document, 'species-photos');
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export function speciesPhotoFile(p: StoredSpeciesPhoto): File {
  return new File(Paths.document, p.path);
}

function current(taxonId: string): StoredSpeciesPhoto | null {
  const row = first<{ json: string }>('SELECT json FROM setup WHERE key = ? ORDER BY version DESC LIMIT 1', [key(taxonId)]);
  return row ? (JSON.parse(row.json) as StoredSpeciesPhoto) : null;
}

/**
 * Saves each photo that came with checked bytes (temp name, then rename). Returns one "what changed" line for the
 * whole set. Applying the same bundle twice changes nothing.
 */
export function saveSpeciesPhotos(list: SpeciesPhoto[], files: Record<string, Uint8Array>, source: string, bundleCreatedAt: string): string[] {
  let added = 0;
  let updated = 0;
  for (const p of list) {
    const bytes = files[p.taxonId];
    if (!bytes) continue; // failed its checksum: readBundle already named it in the warnings
    const prev = current(p.taxonId);
    if (prev && prev.bundleCreatedAt > bundleCreatedAt) continue; // we already hold a newer one
    const dir = photosDir();
    const name = `${safe(p.taxonId)}-${p.sha256.slice(0, 12)}.jpg`;
    const target = new File(dir, name);
    if (!target.exists) {
      const tmp = new File(dir, `${name}.tmp`);
      if (tmp.exists) tmp.delete();
      tmp.create();
      tmp.write(bytes);
      tmp.rename(name);
    }
    const stored: StoredSpeciesPhoto = { ...p, path: `species-photos/${name}`, bundleCreatedAt };
    const same = prev && JSON.stringify({ ...prev, bundleCreatedAt: '' }) === JSON.stringify({ ...stored, bundleCreatedAt: '' });
    if (same) continue;
    putSetupIfChanged(key(p.taxonId), stored, source);
    if (prev && prev.path !== stored.path) {
      const old = speciesPhotoFile(prev);
      if (old.exists) old.delete();
    }
    if (prev) updated++;
    else added++;
  }
  const changes: string[] = [];
  if (added) changes.push(`Species photos for offline use: ${added} saved`);
  if (updated) changes.push(`Species photos updated: ${updated}`);
  return changes;
}

/** The newest saved photo per taxonId whose file is on the phone. */
export function listSpeciesPhotos(): Record<string, StoredSpeciesPhoto> {
  const ids = all<{ key: string }>("SELECT DISTINCT key FROM setup WHERE key LIKE 'speciesPhoto:%' ORDER BY key").map((r) => r.key.slice('speciesPhoto:'.length));
  const out: Record<string, StoredSpeciesPhoto> = {};
  for (const id of ids) {
    const p = current(id);
    if (p && speciesPhotoFile(p).exists) out[id] = p;
  }
  return out;
}
