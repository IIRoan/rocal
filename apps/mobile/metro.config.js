const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Find the project and workspace directories
const projectRoot = __dirname;
const workspaceRoot = path.resolve(__dirname, '../..');

// Create the default Expo config for Metro
const config = getDefaultConfig(projectRoot);

// Add the workspace root to watch folders for monorepo support
config.watchFolders = [workspaceRoot];

// Configure resolver for monorepo
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

config.resolver.extraNodeModules = {
  react: path.resolve(projectRoot, 'node_modules/react'),
  'react/jsx-runtime': path.resolve(projectRoot, 'node_modules/react/jsx-runtime'),
  'react/jsx-dev-runtime': path.resolve(projectRoot, 'node_modules/react/jsx-dev-runtime'),
  'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
  semver: path.resolve(
    workspaceRoot,
    'node_modules/.bun/semver@7.7.3/node_modules/semver',
  ),
  '@tanstack/react-query': path.resolve(
    workspaceRoot,
    'node_modules/@tanstack/react-query',
  ),
  '@tanstack/query-core': path.resolve(
    workspaceRoot,
    'node_modules/@tanstack/query-core',
  ),
};

// Enable package exports for better module resolution
config.resolver.unstable_enablePackageExports = true;

// Limit max workers to prevent "too many open files" error on Windows
config.maxWorkers = 1;

module.exports = config;
