module.exports = {
  displayName: "web",
  rootDir: ".",
  testEnvironment: "node",
  testMatch: ["<rootDir>/__tests__/**/*.test.ts", "<rootDir>/__tests__/**/*.test.tsx"],
  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": [
      "babel-jest",
      { configFile: require.resolve("../../babel.config.js") },
    ],
  },
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^@workspace/logger$": "<rootDir>/../../packages/logger/src/index.ts",
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};