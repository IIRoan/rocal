const {
  nativeJestModuleNameMapper,
  nativeJestTransformIgnorePatterns,
} = require("../../packages/native-core/jest.shared.cjs");
const { REACT_COMPILER_JEST_OPTIONS } = require("../../jest.react-compiler.cjs");

module.exports = {
  displayName: "native-mail",
  rootDir: ".",
  testEnvironment: "node",
  setupFiles: ["<rootDir>/../../packages/native-core/jest.setup.ts"],
  testMatch: ["<rootDir>/src/**/*.test.ts", "<rootDir>/src/**/*.test.tsx"],
  transform: {
    "^.+\\.(js|jsx|ts|tsx|mjs)$": [
      "babel-jest",
      {
        configFile: require.resolve("../../babel.config.cts"),
        ...REACT_COMPILER_JEST_OPTIONS,
      },
    ],
  },
  transformIgnorePatterns: nativeJestTransformIgnorePatterns,
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "mjs", "json", "node"],
  moduleNameMapper: {
    ...nativeJestModuleNameMapper("<rootDir>/../.."),
    "^@/(.*)$": "<rootDir>/$1",
  },
};
