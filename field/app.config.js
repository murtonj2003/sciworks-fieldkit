// Builds and normal `eas update`s use app.json exactly as it is.
// EXPO_GO_PREVIEW=1 publishes an update Expo Go can open (Expo Go only runs updates whose runtime is its own
// SDK version), so an iPhone can try the app without an installed build. It never changes the Android build.
module.exports = ({ config }) => (process.env.EXPO_GO_PREVIEW ? { ...config, runtimeVersion: 'exposdk:57.0.0' } : config);
