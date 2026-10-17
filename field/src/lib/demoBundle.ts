// The demo HQ bundle ships inside the app, so "Load demo project" works in airplane mode.
// It is the golden fixture from shared/ (one source of truth; regenerate it there, never edit a copy).
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const DEMO_HQ_BUNDLE = require('../../../shared/fixtures/HQ_sample.zip');

export const DEMO_BUNDLE_NAME = 'HQ_sample.zip';

export async function demoHqBundleBytes(): Promise<Uint8Array> {
  const asset = Asset.fromModule(DEMO_HQ_BUNDLE);
  await asset.downloadAsync();
  return new File(asset.localUri ?? asset.uri).bytes();
}
