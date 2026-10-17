// DEV ONLY: the expo-sqlite sync API on sql.js (pure-JS SQLite, in memory), so the app can run in a desktop
// browser for design screenshots. Metro swaps it in for expo-sqlite on the web platform only; phones and builds
// never load it. The same SQL and triggers run; data lasts for the tab's lifetime.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const initSqlJs = require('sql.js/dist/sql-asm.js');

type Value = string | number | null | boolean | Uint8Array;
export type SQLiteBindValue = Value;
type SqlJsDb = {
  run(sql: string, params?: unknown[]): void;
  exec(sql: string): void;
  prepare(sql: string): {
    bind(p: unknown[]): void;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): void;
  };
  getRowsModified(): number;
};

let engine: { Database: new () => SqlJsDb } | null = null;
/** Resolves once the engine is loaded; the root layout waits for it on web before opening the database. */
export const ready: Promise<void> = initSqlJs().then((SQL: { Database: new () => SqlJsDb }) => {
  engine = SQL;
});

const norm = (p: Value[]) => p.map((v) => (typeof v === 'boolean' ? Number(v) : v));

class SQLiteDatabase {
  constructor(private db: SqlJsDb) {}
  execSync(sql: string) {
    this.db.exec(sql);
  }
  runSync(sql: string, params: Value[] = []) {
    this.db.run(sql, norm(params));
    return { changes: this.db.getRowsModified(), lastInsertRowId: 0 };
  }
  getAllSync<T>(sql: string, params: Value[] = []): T[] {
    const st = this.db.prepare(sql);
    st.bind(norm(params));
    const rows: T[] = [];
    while (st.step()) rows.push(st.getAsObject() as T);
    st.free();
    return rows;
  }
  getFirstSync<T>(sql: string, params: Value[] = []): T | null {
    return this.getAllSync<T>(sql, params)[0] ?? null;
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

export function openDatabaseSync(_name: string) {
  if (!engine) throw new Error('web preview: sql.js not loaded yet');
  return new SQLiteDatabase(new engine.Database());
}
