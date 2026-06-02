module.exports = {
  displayName: "native",
  rootDir: ".",
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/**/*.test.ts", "<rootDir>/src/**/*.test.tsx"],
  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": [
      "babel-jest",
      { configFile: require.resolve("../../babel.config.cts") },
    ],
  },
  // Allow babel-jest to transform ESM-only packages inside node_modules
  transformIgnorePatterns: [
    "/node_modules/(?!@noble/(?:hashes|curves|ciphers)/)",
  ],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  moduleNameMapper: {
    // Force a single React instance to prevent "Invalid hook call" errors
    // caused by react-dom (19.2.0) bundling its own react (19.2.0) while the
    // app imports react@19.1.0 from the root. Redirecting all react imports to
    // react-dom's peer version keeps them in sync.
    "^react$": "<rootDir>/../../node_modules/react-dom/node_modules/react/index.js",
    "^react/jsx-runtime$": "<rootDir>/../../node_modules/react-dom/node_modules/react/jsx-runtime.js",
    "^react/jsx-dev-runtime$": "<rootDir>/../../node_modules/react-dom/node_modules/react/jsx-dev-runtime.js",
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
