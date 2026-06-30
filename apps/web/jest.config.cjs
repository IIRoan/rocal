const path = require("path");
const { createReactDedupeMapper } = require("../../jest.react-dedupe.cjs");

const repoRoot = path.join(__dirname, "../..");

module.exports = {
  displayName: "web",
  rootDir: ".",
  testEnvironment: "node",
  setupFiles: ["<rootDir>/jest.setup.ts"],
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
    "^@workspace/runtime$": "<rootDir>/../../packages/runtime/src/index.ts",
    "^@workspace/runtime/(.*)$": "<rootDir>/../../packages/runtime/src/$1",
    "^@workspace/ui$": "<rootDir>/../../packages/ui/src/index.ts",
    "^@workspace/ui/(.*)$": "<rootDir>/../../packages/ui/src/$1",
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
