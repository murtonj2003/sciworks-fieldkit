// Test stand-in for the expo-file-system File / Directory / Paths classes, on a temp folder.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// One root per test run (module re-imports simulate app restarts and must see the same files).
const ROOT = (process.env.FIELD_TEST_FS ??= fs.mkdtempSync(path.join(os.tmpdir(), 'field-test-')));

type Part = string | File | Directory;
const join = (parts: Part[]) => path.join(...parts.map((p) => (typeof p === 'string' ? p.replace(/^file:\/\//, '') : p.path)));

export class Directory {
  path: string;
  constructor(...parts: Part[]) {
    this.path = join(parts);
  }
  get uri() {
    return `file://${this.path}`;
  }
  get exists() {
    return fs.existsSync(this.path);
  }
  create(_opts?: unknown) {
    fs.mkdirSync(this.path, { recursive: true });
  }
  list(): (File | Directory)[] {
    return fs.readdirSync(this.path).map((n) => {
      const p = path.join(this.path, n);
      return fs.statSync(p).isDirectory() ? new Directory(p) : new File(p);
    });
  }
}

export class File {
  path: string;
  constructor(...parts: Part[]) {
    this.path = join(parts);
  }
  get uri() {
    return `file://${this.path}`;
  }
  get name() {
    return path.basename(this.path);
  }
  get exists() {
    return fs.existsSync(this.path);
  }
  create(_opts?: unknown) {
    fs.writeFileSync(this.path, new Uint8Array());
  }
  write(content: string | Uint8Array) {
    fs.writeFileSync(this.path, content);
  }
  delete() {
    fs.rmSync(this.path);
  }
  rename(newName: string) {
    const next = path.join(path.dirname(this.path), newName);
    fs.renameSync(this.path, next);
    this.path = next;
  }
  async bytes() {
    return new Uint8Array(fs.readFileSync(this.path));
  }
  bytesSync() {
    return new Uint8Array(fs.readFileSync(this.path));
  }
  base64Sync() {
    return fs.readFileSync(this.path).toString('base64');
  }
}

export const Paths = {
  get document() {
    return new Directory(ROOT, 'document');
  },
  get cache() {
    return new Directory(ROOT, 'cache');
  },
};
