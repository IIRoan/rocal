/** Jest settings shared by native-core and both native apps. */
const nativeJestTransformIgnorePatterns = [
  "/node_modules/(?!(@noble/|.*/@noble/)(?:hashes|curves|ciphers)/|blobatar|@blobatar/|react-native-svg/)",
];

function nativeJestModuleNameMapper(repoRoot) {
  const pkg = (name) => `${repoRoot}/packages/${name}/src`;
  return {
    // Keep a single React instance; react-dom can nest an older copy.
    "^react$": `${repoRoot}/node_modules/react/index.js`,
    "^react/jsx-runtime$": `${repoRoot}/node_modules/react/jsx-runtime.js`,
    "^react/jsx-dev-runtime$": `${repoRoot}/node_modules/react/jsx-dev-runtime.js`,
    "^@workspace/native-core/(.*)$": `${pkg("native-core")}/$1`,
    "^@workspace/design-tokens$": `${pkg("design-tokens")}/index.ts`,
    "^@workspace/design-tokens/(.*)$": `${pkg("design-tokens")}/$1`,
    "^@workspace/calendar-core$": `${pkg("calendar-core")}/index.ts`,
    "^@workspace/calendar-core/(.*)$": `${pkg("calendar-core")}/$1`,
    "^@workspace/calendar-client$": `${pkg("calendar-client")}/index.ts`,
    "^@workspace/calendar-client/(.*)$": `${pkg("calendar-client")}/$1`,
    "^@workspace/e2ee$": `${pkg("e2ee")}/index.ts`,
    "^@workspace/e2ee/(.*)$": `${pkg("e2ee")}/$1`,
    "^@workspace/logger$": `${pkg("logger")}/index.ts`,
    "^@workspace/logger/(.*)$": `${pkg("logger")}/$1`,
    "^@workspace/runtime$": `${pkg("runtime")}/index.ts`,
    "^@workspace/runtime/(.*)$": `${pkg("runtime")}/$1`,
    "^(\\.{1,2}/.*)\\.js$": "$1",
  };
}

module.exports = { nativeJestModuleNameMapper, nativeJestTransformIgnorePatterns };
