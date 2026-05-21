module.exports = {
  displayName: "ui",
  rootDir: ".",
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/**/*.test.ts", "<rootDir>/src/**/*.test.tsx"],
  collectCoverageFrom: [
    "<rootDir>/src/components/calendar/color-utils.ts",
    "<rootDir>/src/hooks/mini-calendar-day-events.ts",
  ],
  coverageDirectory: "<rootDir>/coverage",
  coverageReporters: ["text", "json-summary", "lcov", "html"],
  coverageThreshold: {
    global: {
      statements: 95,
      branches: 85,
      functions: 100,
      lines: 95,
    },
  },
  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": [
      "babel-jest",
      { configFile: require.resolve("../../babel.config.cts") },
    ],
  },
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
