// Install native WebCrypto before Expo Router loads any route so E2EE modules see it at evaluation.
// CommonJS `require` keeps that order; ESM `import` would hoist both modules.
require("@workspace/native-core/lib/install-native-crypto");
require("@workspace/native-core/lib/push-notification-handler").registerForegroundPushNotificationHandler();
require("@workspace/native-core/lib/boot-heal").healAuthStorageAtBoot();
require("expo-router/entry");
