module.exports = {
  preset: 'react-native',
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)/)',
  ],
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx|js)',
    '**/?(*.)+(spec|test).+(ts|tsx|js)',
  ],
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '^react-native$': 'react-native-web',
    '^@react-native/js-polyfills/error-guard$': '<rootDir>/jest/mocks/error-guard.js',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
