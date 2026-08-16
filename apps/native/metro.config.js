const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// ---------------------------------------------------------------------------
// OpenPGP.js resolution fix (Hermes / React Native)
//
// openpgp@5 ships an IIFE bundle at its default `main` / `browser` entry
// (`dist/openpgp.min.js`) shaped like `var openpgp = (function (e) { … })({})`.
// That build assigns to a module-scoped variable and never sets
// `module.exports`, so when Metro loads it as CommonJS the namespace import
// `import * as openpgp from "openpgp"` resolves to an EMPTY object — every
// function (readPrivateKey, decrypt, …) is `undefined` at runtime, producing:
//   "openpgp.readPrivateKey is not a function (it is undefined)".
//
// The `dist/openpgp.min.mjs` browser ESM build, by contrast, has proper named
// exports and pulls in NO Node builtins (no buffer/stream/crypto/zlib), so it
// runs in Hermes.
//
// We resolve the bare `openpgp` specifier to a local shim
// (`src/lib/mail/openpgp-hermes.js`) which imports that ESM build and applies a
// `Symbol.species` polyfill for `PacketList` (Hermes lacks Symbol.species, so
// native Array methods like `concat`/`slice`/`filter` on a PacketList would
// otherwise return a plain Array, breaking `filterByTag`). The shim imports the
// real build via the `openpgp/dist/openpgp.min.mjs` path, which does NOT match
// the bare `openpgp` specifier below, so there is no resolution loop.
// TypeScript types still come from the package's own `openpgp.d.ts`.
// Native `crypto` imports are redirected to react-native-quick-crypto so
// OpenPGP's Node fallback (`require("crypto")`) and any other Node crypto
// consumers get the native implementation on iOS/Android.
// ---------------------------------------------------------------------------
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
