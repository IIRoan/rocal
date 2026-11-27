module.exports = {
  displayName: "mail-editor",
  rootDir: ".",
  testEnvironment: "jsdom",
  testMatch: ["<rootDir>/src/**/*.test.ts"],
  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": [
      "babel-jest",
      { configFile: require.resolve("../../babel.config.cts") },
    ],
  },
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  moduleNameMapper: {
    "^@workspace/calendar-core$": "<rootDir>/../calendar-core/src/index.ts",
    "^@workspace/calendar-core/(.*)$": "<rootDir>/../calendar-core/src/$1",
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
