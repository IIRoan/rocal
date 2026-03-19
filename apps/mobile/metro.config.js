const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const { withNativewind } = require('nativewind/metro');

// Find the project and workspace directories
const projectRoot = __dirname;
const workspaceRoot = path.resolve(__dirname, '../..');
const workspacePackages = [
  'packages/calendar-client',
  'packages/calendar-core',
  'packages/logger',
  'packages/ui',
].map((relativePath) => path.resolve(workspaceRoot, relativePath));
const workspaceNodeModules = path.resolve(workspaceRoot, 'node_modules');
const bunStore = path.resolve(workspaceNodeModules, '.bun');

// Create the default Expo config for Metro
const config = getDefaultConfig(projectRoot);

// Watch only the shared packages the mobile app consumes plus Bun's package store.
// Bun installs app deps as symlinks into the root .bun store, so Metro must see that target.
config.watchFolders = [...workspacePackages, workspaceNodeModules, bunStore];

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
  zod: path.resolve(workspaceRoot, 'node_modules/.bun/zod@4.3.6/node_modules/zod'),
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

module.exports = withNativewind(config);
