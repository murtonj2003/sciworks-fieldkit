// The demo HQ bundle ships inside the app, so "Load demo project" works in airplane mode.
// It is the golden fixture from shared/ (one source of truth; regenerate it there, never edit a copy).
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const DEMO_HQ_BUNDLE = require('../../../shared/fixtures/HQ_sample.zip');

export const DEMO_BUNDLE_NAME = 'HQ_sample.zip';

export async function demoHqBundleBytes(): Promise<Uint8Array> {
  const asset = Asset.fromModule(DEMO_HQ_BUNDLE);
  if (Platform.OS === 'web') {
    // DEV ONLY: the browser preview for design screenshots fetches the asset directly. Phones skip this.
    const res = await fetch(asset.uri);
    return new Uint8Array(await res.arrayBuffer());
  }
  await asset.downloadAsync();
  return new File(asset.localUri ?? asset.uri).bytes();
}
