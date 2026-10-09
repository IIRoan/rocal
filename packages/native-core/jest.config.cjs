const { nativeJestModuleNameMapper, nativeJestTransformIgnorePatterns } = require("./jest.shared.cjs");

module.exports = {
  displayName: "native-core",
  rootDir: ".",
  testEnvironment: "node",
  setupFiles: ["<rootDir>/jest.setup.ts"],
  testMatch: ["<rootDir>/src/**/*.test.ts", "<rootDir>/src/**/*.test.tsx"],
  transform: {
    "^.+\\.(js|jsx|ts|tsx|mjs)$": [
      "babel-jest",
      { configFile: require.resolve("../../babel.config.cts") },
    ],
  },
  transformIgnorePatterns: nativeJestTransformIgnorePatterns,
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "mjs", "json", "node"],
  moduleNameMapper: nativeJestModuleNameMapper("<rootDir>/../.."),
};
