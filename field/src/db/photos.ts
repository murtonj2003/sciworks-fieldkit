// Photos live in the app's documents folder (never the cache), named by photoId. Paths are stored relative
// to that folder, because iOS moves the app's container on every update.
import { sha256Hex, type Photo, type Uuid } from '@sciworks/shared';
import { Directory, File, Paths } from 'expo-file-system';

import { all, first, run } from './db';

interface PhotoRow {
  photo_id: string;
  record_id: string;
  path: string;
  sha256: string;
  bytes: number;
  w: number;
  h: number;
  role: Photo['role'] | null;
  taken_at: string;
}

function photosDir(): Directory {
  const dir = new Directory(Paths.document, 'photos');
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export function photoFile(relPath: string): File {
  return new File(Paths.document, relPath);
}

/** Writes to a temp name, then renames, so a crash never leaves a half photo under the real name. */
export function savePhoto(input: {
  photoId: Uuid;
  recordId: Uuid;
  bytes: Uint8Array;
  widthPx: number;
  heightPx: number;
  takenAt: string;
  role?: Photo['role'];
}): Photo {
  const dir = photosDir();
  const name = `${input.photoId}.jpg`;
  const tmp = new File(dir, `${name}.tmp`);
  if (tmp.exists) tmp.delete();
  tmp.create();
  tmp.write(input.bytes);
  tmp.rename(name);
  const sha256 = sha256Hex(input.bytes);
  run(
    `INSERT OR IGNORE INTO photos (photo_id, record_id, path, sha256, bytes, w, h, role, taken_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.photoId, input.recordId, `photos/${name}`, sha256, input.bytes.length, input.widthPx, input.heightPx, input.role ?? null, input.takenAt],
  );
  return toPhoto(first<PhotoRow>('SELECT * FROM photos WHERE photo_id = ?', [input.photoId])!);
}

function toPhoto(r: PhotoRow): Photo {
  return {
    photoId: r.photo_id,
    recordId: r.record_id,
    ...(r.role ? { role: r.role } : {}),
    file: `photos/${r.photo_id}.jpg`,
    takenAt: r.taken_at,
    bytes: r.bytes,
    sha256: r.sha256,
    widthPx: r.w,
    heightPx: r.h,
  };
}

export function listPhotos(recordId?: Uuid): (Photo & { path: string })[] {
  const rows = recordId
    ? all<PhotoRow>('SELECT * FROM photos WHERE record_id = ? ORDER BY taken_at', [recordId])
    : all<PhotoRow>('SELECT * FROM photos ORDER BY taken_at');
  return rows.map((r) => ({ ...toPhoto(r), path: r.path }));
}

export async function photoBytes(relPath: string): Promise<Uint8Array> {
  return photoFile(relPath).bytes();
}

export function photoUri(relPath: string): string {
  return photoFile(relPath).uri;
}

/** Torture-test check: every photo file is there and its SHA-256 still matches. */
export async function verifyPhotos(): Promise<{ total: number; ok: number; missing: string[]; mismatched: string[] }> {
  const rows = all<PhotoRow>('SELECT * FROM photos');
  const missing: string[] = [];
  const mismatched: string[] = [];
  for (const r of rows) {
    const f = photoFile(r.path);
    if (!f.exists) {
      missing.push(r.photo_id);
      continue;
    }
    if (sha256Hex(await f.bytes()) !== r.sha256) mismatched.push(r.photo_id);
  }
  return { total: rows.length, ok: rows.length - missing.length - mismatched.length, missing, mismatched };
}
