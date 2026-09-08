const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// OpenPGP.js resolution fix (Hermes / React Native) — see openpgp-hermes.js.
const openpgpHermesShim = path.resolve(
  __dirname,
  "src/lib/mail/openpgp-hermes.js",
);

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "openpgp") {
    return { type: "sourceFile", filePath: openpgpHermesShim };
  }
  if (
    moduleName === "crypto" &&
    (platform === "ios" || platform === "android")
  ) {
    return context.resolveRequest(
      context,
      "react-native-quick-crypto",
      platform,
    );
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
