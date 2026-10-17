// Expo's default config already handles the npm workspace (watches the repo root, resolves @sciworks/shared).
// We only add .zip so the demo HQ bundle can ship inside the app as an asset and load in airplane mode.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('zip');

// DEV ONLY, web platform only: a browser preview for design screenshots. Phones and builds are unaffected.
// expo-file-system and expo-sqlite have no usable web version here, so in-memory stand-ins are used
// (dev/web-shims/; sql.js is a dev dependency).
const WEB_SHIMS = {
  'expo-file-system': 'dev/web-shims/expo-file-system.ts',
  'expo-sqlite': 'dev/web-shims/expo-sqlite.ts',
};
const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && WEB_SHIMS[moduleName]) {
    return { type: 'sourceFile', filePath: path.resolve(__dirname, WEB_SHIMS[moduleName]) };
  }
  return (upstreamResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
