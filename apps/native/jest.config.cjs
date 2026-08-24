module.exports = {
  displayName: "native",
  rootDir: ".",
  testEnvironment: "node",
  setupFiles: ["<rootDir>/jest.setup.ts"],
  testMatch: ["<rootDir>/src/**/*.test.ts", "<rootDir>/src/**/*.test.tsx"],
  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": [
      "babel-jest",
      { configFile: require.resolve("../../babel.config.cts") },
    ],
  },
  // Allow babel-jest to transform ESM-only packages inside node_modules
  transformIgnorePatterns: [
    "/node_modules/(?!(@noble/|.*/@noble/)(?:hashes|curves|ciphers)/|blobatar|@blobatar/|react-native-svg/)",
  ],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  moduleNameMapper: {
    // Keep a single React instance. react-dom still nests an older copy in
    // some layouts; native is on React 19.2.3 from Expo SDK 57.
    "^react$": "<rootDir>/../../node_modules/react/index.js",
    "^react/jsx-runtime$": "<rootDir>/../../node_modules/react/jsx-runtime.js",
    "^react/jsx-dev-runtime$": "<rootDir>/../../node_modules/react/jsx-dev-runtime.js",
    "^@/(.*)$": "<rootDir>/$1",
    "^@workspace/design-tokens$":
      "<rootDir>/../../packages/design-tokens/src/index.ts",
    "^@workspace/design-tokens/(.*)$":
      "<rootDir>/../../packages/design-tokens/src/$1",
    "^@workspace/calendar-core$":
      "<rootDir>/../../packages/calendar-core/src/index.ts",
    "^@workspace/calendar-core/(.*)$":
      "<rootDir>/../../packages/calendar-core/src/$1",
    "^@workspace/calendar-client$":
      "<rootDir>/../../packages/calendar-client/src/index.ts",
    "^@workspace/calendar-client/(.*)$":
      "<rootDir>/../../packages/calendar-client/src/$1",
    "^@workspace/e2ee$": "<rootDir>/../../packages/e2ee/src/index.ts",
    "^@workspace/e2ee/(.*)$": "<rootDir>/../../packages/e2ee/src/$1",
    "^@workspace/logger$": "<rootDir>/../../packages/logger/src/index.ts",
    "^@workspace/logger/(.*)$": "<rootDir>/../../packages/logger/src/$1",
    "^@workspace/runtime$": "<rootDir>/../../packages/runtime/src/index.ts",
    "^@workspace/runtime/(.*)$": "<rootDir>/../../packages/runtime/src/$1",
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
