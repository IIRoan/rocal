// Install native WebCrypto before Expo Router loads any route. OpenPGP.js 6
// throws "The WebCrypto API is not available" while evaluating the module, so
// this must run before `expo-router/entry` pulls in mail-crypto / AuthProvider.
// CommonJS `require` keeps that order; ESM `import` would hoist both modules.
require("@workspace/native-core/lib/install-native-crypto");
require("@workspace/native-core/lib/push-notification-handler").registerForegroundPushNotificationHandler();
require("@workspace/native-core/lib/boot-heal").healAuthStorageAtBoot();
require("expo-router/entry");
