const path = require("path");
const { createReactDedupeMapper } = require("../../jest.react-dedupe.cjs");

const repoRoot = path.join(__dirname, "../..");

module.exports = {
  displayName: "web",
  rootDir: ".",
  setupFiles: ["<rootDir>/jest.setup.ts"],
  testEnvironment: "node",
  transformIgnorePatterns: [
    "/node_modules/(?!(better-auth|@better-auth|blobatar|@blobatar)/)",
  ],
  testMatch: [
    "<rootDir>/__tests__/**/*.test.ts",
    "<rootDir>/__tests__/**/*.test.tsx",
  ],
  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": [
      "babel-jest",
      { configFile: require.resolve("../../babel.config.cts") },
    ],
  },
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  moduleNameMapper: {
    ...createReactDedupeMapper(repoRoot),
    "^@/lib/auth-client$": "<rootDir>/__tests__/mocks/auth-client.ts",
    "^\\.\\./auth-client$": "<rootDir>/__tests__/mocks/auth-client.ts",
    "^(\\.\\./)+lib/auth-client$": "<rootDir>/__tests__/mocks/auth-client.ts",
    "^@/(.*)$": "<rootDir>/$1",
    "^@workspace/logger$": "<rootDir>/../../packages/logger/src/index.ts",
    "^@workspace/calendar-core$":
      "<rootDir>/../../packages/calendar-core/src/index.ts",
    "^@workspace/calendar-core/(.*)$":
      "<rootDir>/../../packages/calendar-core/src/$1",
    "^@workspace/calendar-ics$":
      "<rootDir>/../../packages/calendar-ics/src/index.ts",
    "^@workspace/calendar-ics/(.*)$":
      "<rootDir>/../../packages/calendar-ics/src/$1",
    "^@workspace/calendar-client$":
      "<rootDir>/../../packages/calendar-client/src/index.ts",
    "^@workspace/calendar-client/(.*)$":
      "<rootDir>/../../packages/calendar-client/src/$1",
    "^@workspace/runtime$": "<rootDir>/../../packages/runtime/src/index.ts",
    "^@workspace/runtime/(.*)$": "<rootDir>/../../packages/runtime/src/$1",
    "^@workspace/ui$": "<rootDir>/../../packages/ui/src/index.ts",
    "^@workspace/ui/(.*)$": "<rootDir>/../../packages/ui/src/$1",
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
