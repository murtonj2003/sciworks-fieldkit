// Stand-ins for the few React Native / Expo bits the storage code touches.
export const AppState = { addEventListener: () => ({ remove() {} }) };
export default { expoConfig: { version: 'test' } };
export const getRandomValues = (a: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(a);
