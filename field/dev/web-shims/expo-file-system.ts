// DEV ONLY: lets the app run in a desktop browser for design screenshots. Metro swaps this in for
// expo-file-system on the web platform only (metro.config.js); phones and builds never load it.
// Files live in memory for the tab's lifetime; http(s) URIs (bundled assets) are fetched.
const store = new Map<string, Uint8Array>();
const dirs = new Set<string>();

type Part = string | File | Directory;
const join = (parts: Part[]) =>
  parts
    .map((p) => (typeof p === 'string' ? p : p.uri))
    .join('/')
    .replace(/(?<!:)\/{2,}/g, '/');

export class Directory {
  uri: string;
  constructor(...parts: Part[]) {
    this.uri = join(parts);
  }
  get exists() {
    return dirs.has(this.uri);
  }
  create() {
    dirs.add(this.uri);
  }
  get size(): number {
    const prefix = `${this.uri}/`;
    let n = 0;
    for (const [k, v] of store) if (k.startsWith(prefix)) n += v.length;
    return n;
  }
  list(): (File | Directory)[] {
    const prefix = `${this.uri}/`;
    return [...store.keys()].filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/')).map((k) => new File(k));
  }
}

export class File {
  uri: string;
  constructor(...parts: Part[]) {
    this.uri = join(parts);
  }
  get name() {
    return this.uri.split('/').pop() ?? '';
  }
  get exists() {
    return store.has(this.uri);
  }
  create() {
    store.set(this.uri, new Uint8Array());
  }
  write(content: string | Uint8Array) {
    store.set(this.uri, typeof content === 'string' ? new TextEncoder().encode(content) : content);
  }
  delete() {
    store.delete(this.uri);
  }
  rename(newName: string) {
    const next = `${this.uri.slice(0, this.uri.lastIndexOf('/'))}/${newName}`;
    const v = store.get(this.uri);
    store.delete(this.uri);
    if (v) store.set(next, v);
    this.uri = next;
  }
  base64Sync(): string {
    const b = store.get(this.uri) ?? new Uint8Array();
    let bin = '';
    for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  async bytes(): Promise<Uint8Array> {
    if (!this.uri.startsWith('mem://')) return new Uint8Array(await (await fetch(this.uri)).arrayBuffer()); // a bundled asset
    return store.get(this.uri) ?? new Uint8Array();
  }
}

export const Paths = {
  // DEV ONLY sample numbers for the browser preview (a phone reports its own).
  totalDiskSpace: 128e9,
  availableDiskSpace: 80e9,
  get document() {
    return new Directory('mem://document');
  },
  get cache() {
    return new Directory('mem://cache');
  },
};
