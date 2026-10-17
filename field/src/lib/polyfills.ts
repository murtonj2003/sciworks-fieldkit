// Imported first by the root layout. uuid v7 needs crypto.getRandomValues, which React Native doesn't
// always provide, so borrow it from expo-crypto.
import { getRandomValues } from 'expo-crypto';

const g = globalThis as { crypto?: { getRandomValues?: unknown } };
if (!g.crypto) g.crypto = {};
if (typeof g.crypto.getRandomValues !== 'function') g.crypto.getRandomValues = getRandomValues;
