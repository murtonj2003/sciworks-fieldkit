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
  async bytes(): Promise<Uint8Array> {
    if (!this.uri.startsWith('mem://')) return new Uint8Array(await (await fetch(this.uri)).arrayBuffer()); // a bundled asset
    return store.get(this.uri) ?? new Uint8Array();
  }
}

export const Paths = {
  get document() {
    return new Directory('mem://document');
  },
  get cache() {
    return new Directory('mem://cache');
  },
};
