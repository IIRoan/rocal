module.exports = {
  displayName: "backend",
  rootDir: ".",
  testEnvironment: "node",
  testMatch: ["<rootDir>/__tests__/**/*.test.ts"],
  collectCoverageFrom: [
    "<rootDir>/lib/auth-guard.ts",
    "<rootDir>/lib/auth-utils.ts",
    "<rootDir>/lib/calendar-sync-service.ts",
    "<rootDir>/lib/colors.ts",
    "<rootDir>/lib/errors.ts",
    "<rootDir>/lib/ics-export.ts",
    "<rootDir>/lib/ics-parser.ts",
    "<rootDir>/lib/notification-calculator.ts",
    "<rootDir>/lib/user-setup.ts",
    "<rootDir>/routes/categories.ts",
    "<rootDir>/routes/notifications.ts",
    "<rootDir>/routes/settings.ts",
  ],
  coverageDirectory: "<rootDir>/coverage",
  coverageReporters: ["text", "json-summary", "lcov", "html"],
  coverageThreshold: {
    global: {
      statements: 95,
      lines: 95,
      functions: 95,
    },
  },
  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": [
      "babel-jest",
      { configFile: require.resolve("../../babel.config.js") },
    ],
  },
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  moduleNameMapper: {
    "^@workspace/calendar-ics$":
      "<rootDir>/../../packages/calendar-ics/src/index.ts",
    "^@workspace/calendar-ics/(.*)$":
      "<rootDir>/../../packages/calendar-ics/src/$1.ts",
    "^@workspace/logger$": "<rootDir>/../../packages/logger/src/index.ts",
    "^@workspace/runtime$": "<rootDir>/../../packages/runtime/src/index.ts",
    "^@workspace/runtime/(.*)$": "<rootDir>/../../packages/runtime/src/$1",
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  setupFilesAfterEnv: ["<rootDir>/__tests__/setup.ts"],
};
