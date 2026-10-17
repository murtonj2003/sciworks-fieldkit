// Small settings about this phone: its device ID, who is using it, handover times.
import { v7 as uuidv7 } from 'uuid';

import { first, run } from './db';

export function getMeta(key: string): string | null {
  return first<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key])?.value ?? null;
}

export function setMeta(key: string, value: string): void {
  run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
}

/** Made once, on first launch, and never changed. */
export function deviceId(): string {
  const existing = getMeta('deviceId');
  if (existing) return existing;
  const id = uuidv7();
  run('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)', ['deviceId', id]);
  return getMeta('deviceId') ?? id;
}

export function newId(): string {
  return uuidv7();
}
