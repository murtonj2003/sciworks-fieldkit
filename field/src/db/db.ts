// The phone's one database. Nothing is ever lost (MOBILE-BRIEF §5, §8):
// - record_revs is append-only. Triggers make SQLite itself refuse an UPDATE or DELETE on it.
// - drafts hold the record being typed, written on every change; sealing copies a draft into the next rev.
// - WAL + synchronous=FULL: a committed write survives a force-kill or a pulled battery.
// The file lives in the app's documents area (expo-sqlite's default), never the cache.
import { openDatabaseSync, type SQLiteBindValue, type SQLiteDatabase } from 'expo-sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS record_revs (
  id TEXT NOT NULL,
  rev INTEGER NOT NULL,
  record_type TEXT NOT NULL,
  json TEXT NOT NULL,
  saved_at TEXT NOT NULL,
  PRIMARY KEY (id, rev)
);
CREATE TRIGGER IF NOT EXISTS record_revs_no_update BEFORE UPDATE ON record_revs
  BEGIN SELECT RAISE(ABORT, 'record_revs is append-only'); END;
CREATE TRIGGER IF NOT EXISTS record_revs_no_delete BEFORE DELETE ON record_revs
  BEGIN SELECT RAISE(ABORT, 'record_revs is append-only'); END;

CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY NOT NULL,
  record_type TEXT NOT NULL,
  json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  dirty INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS photos (
  photo_id TEXT PRIMARY KEY NOT NULL,
  record_id TEXT NOT NULL,
  path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  w INTEGER NOT NULL,
  h INTEGER NOT NULL,
  role TEXT,
  taken_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS photos_no_delete BEFORE DELETE ON photos
  BEGIN SELECT RAISE(ABORT, 'photos are never deleted'); END;

CREATE TABLE IF NOT EXISTS setup (
  key TEXT NOT NULL,
  version INTEGER NOT NULL,
  json TEXT NOT NULL,
  received_at TEXT NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (key, version)
);

CREATE TABLE IF NOT EXISTS receipts (
  id TEXT NOT NULL,
  rev INTEGER NOT NULL,
  record_type TEXT NOT NULL,
  received_at TEXT NOT NULL,
  PRIMARY KEY (id, rev)
);

CREATE TABLE IF NOT EXISTS reviews (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL,
  rev INTEGER NOT NULL,
  status TEXT NOT NULL,
  at TEXT NOT NULL,
  json TEXT NOT NULL,
  UNIQUE (id, rev, status, at)
);

CREATE TABLE IF NOT EXISTS corrections (
  correction_id TEXT PRIMARY KEY NOT NULL,
  record_id TEXT NOT NULL,
  json TEXT NOT NULL,
  received_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS correction_responses (
  correction_id TEXT PRIMARY KEY NOT NULL,
  json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS provisional_taxa (
  id TEXT PRIMARY KEY NOT NULL,
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS change_requests (
  id TEXT PRIMARY KEY NOT NULL,
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS decisions (
  kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  at TEXT NOT NULL,
  json TEXT NOT NULL,
  PRIMARY KEY (kind, target_id, at)
);

CREATE TABLE IF NOT EXISTS bundles_out (
  bundle_id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  file_name TEXT NOT NULL,
  scope TEXT NOT NULL,
  counts_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bundles_in (
  bundle_id TEXT PRIMARY KEY NOT NULL,
  received_at TEXT NOT NULL,
  file_name TEXT NOT NULL,
  path TEXT,
  manifest_json TEXT NOT NULL,
  summary_json TEXT NOT NULL
);
`;

let db: SQLiteDatabase | null = null;

export function getDb(): SQLiteDatabase {
  if (db) return db;
  const opened = openDatabaseSync('field.db');
  opened.execSync('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;');
  opened.execSync(SCHEMA);
  db = opened;
  return opened;
}

export type Params = SQLiteBindValue[];

export function all<T>(sql: string, params: Params = []): T[] {
  return getDb().getAllSync<T>(sql, params);
}

export function first<T>(sql: string, params: Params = []): T | null {
  return getDb().getFirstSync<T>(sql, params);
}

export function run(sql: string, params: Params = []): number {
  return getDb().runSync(sql, params).changes;
}

export function tx(task: () => void): void {
  getDb().withTransactionSync(task);
}
