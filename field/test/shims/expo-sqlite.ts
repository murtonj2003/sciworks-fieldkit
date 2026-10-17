// Test stand-in for expo-sqlite's sync API, backed by Node's built-in SQLite. Same SQL, same triggers.
import { DatabaseSync } from 'node:sqlite';

type Params = (string | number | null | boolean | Uint8Array)[];
const norm = (p: Params) => p.map((v) => (typeof v === 'boolean' ? Number(v) : v)) as (string | number | null | Uint8Array)[];
const plain = <T>(row: unknown) => (row ? ({ ...(row as object) } as T) : null);

export type SQLiteBindValue = string | number | null | boolean | Uint8Array;

export class SQLiteDatabase {
  constructor(private db: DatabaseSync) {}
  execSync(sql: string) {
    this.db.exec(sql);
  }
  runSync(sql: string, params: Params = []) {
    const r = this.db.prepare(sql).run(...norm(params));
    return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
  }
  getAllSync<T>(sql: string, params: Params = []): T[] {
    return this.db.prepare(sql).all(...norm(params)).map((r) => plain<T>(r)!);
  }
  getFirstSync<T>(sql: string, params: Params = []): T | null {
    return plain<T>(this.db.prepare(sql).get(...norm(params)));
  }
  withTransactionSync(task: () => void) {
    this.db.exec('BEGIN');
    try {
      task();
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
}

export const opened: SQLiteDatabase[] = [];

export function openDatabaseSync(_name: string): SQLiteDatabase {
  const db = new SQLiteDatabase(new DatabaseSync(process.env.FIELD_TEST_DB ?? ':memory:'));
  opened.push(db);
  return db;
}
