// Expo's default config already handles the npm workspace (watches the repo root, resolves @sciworks/shared).
// We only add .zip so the demo HQ bundle can ship inside the app as an asset and load in airplane mode.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('zip');

module.exports = config;
