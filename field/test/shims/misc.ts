// Stand-ins for the few React Native / Expo bits the storage code touches.
// AppState keeps its listeners on globalThis, so a test can send 'background' as the phone would.
type Listener = (state: string) => void;
const g = globalThis as { __appStateListeners?: Listener[] };
export const AppState = {
  addEventListener: (_type: string, fn: Listener) => {
    (g.__appStateListeners ??= []).push(fn);
    return { remove() {} };
  },
};
export const sendAppState = (state: string) => (g.__appStateListeners ?? []).forEach((fn) => fn(state));
export default { expoConfig: { version: 'test' } };
export const getRandomValues = (a: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(a);
