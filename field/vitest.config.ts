// Runs the phone's storage, sync and form logic on Node, with small stand-ins for the native modules.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: here('./src/$1') },
      { find: /^expo-sqlite$/, replacement: here('./test/shims/expo-sqlite.ts') },
      { find: /^expo-file-system$/, replacement: here('./test/shims/expo-file-system.ts') },
      { find: /^react-native$/, replacement: here('./test/shims/misc.ts') },
      { find: /^expo-constants$/, replacement: here('./test/shims/misc.ts') },
      { find: /^expo-crypto$/, replacement: here('./test/shims/misc.ts') },
    ],
  },
  test: { include: ['test/**/*.test.ts'], pool: 'forks' },
});
