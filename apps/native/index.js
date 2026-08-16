// Install native WebCrypto before Expo Router loads any route. OpenPGP.js 6
// throws "The WebCrypto API is not available" while evaluating the module, so
// this must run before `expo-router/entry` pulls in mail-crypto / AuthProvider.
// CommonJS `require` keeps that order; ESM `import` would hoist both modules.
require("./src/lib/install-native-crypto");
require("expo-router/entry");
