// The demo project ships inside the app (lib/demoBundle.ts). A phone that loaded an older copy of it (before the
// satellite picture and the species photos were added, Sat 16:50 / 21:15) never sees "Load demo project" again, so
// its maps had no picture. On start the app re-applies the demo bundle built into this version once, when it
// differs from the one this phone last applied. Receiving an HQ bundle never touches records (it only adds set-up
// versions, pictures and feedback), the same bundle twice changes nothing, and another project is refused untouched.
import { sha256Hex } from '@sciworks/shared';

import { getMeta, setMeta } from '@/db/meta';
import { currentSetup } from '@/db/setup';

import { receiveHqBundle, type ReceiveResult } from './receiveHq';

const KEY = 'demoBundleSha';

/** Remember which built-in demo bundle this phone has applied ("Load demo project" calls it). */
export function markDemoApplied(bytes: Uint8Array): void {
  setMeta(KEY, sha256Hex(bytes));
}

/** Re-applies the built-in demo bundle when it differs from the last one applied. Null when there was nothing to do. */
export function refreshDemoSetup(bytes: Uint8Array, fileName: string): ReceiveResult | null {
  if (!currentSetup('project')) return null; // nothing loaded yet: "Load demo project" does it
  const sha = sha256Hex(bytes);
  if (getMeta(KEY) === sha) return null;
  const r = receiveHqBundle(bytes, fileName);
  setMeta(KEY, sha); // also when refused (a real project on this phone): don't try again on every start
  return r;
}
