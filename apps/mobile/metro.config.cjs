const { getDefaultConfig } = require('expo/metro-config');
const fs = require('fs');
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
const tanstackReactQueryEntry = path.resolve(
  workspaceNodeModules,
  '@tanstack/react-query/src/index.ts',
);
const tanstackQueryCoreEntry = path.resolve(
  workspaceNodeModules,
  '@tanstack/query-core/src/index.ts',
);

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
  // Bun currently installs TanStack Query packages with only `src/` present.
  // Point Metro at source entry files to avoid `main/module` resolution errors on web.
  '@tanstack/react-query': tanstackReactQueryEntry,
  '@tanstack/query-core': tanstackQueryCoreEntry,
};

// Block broken Bun stubs in local node_modules for packages that must come from workspace root.
// This forces Metro to fall through to nodeModulesPaths[1] (workspace root) where real files exist.
const localNodeModules = path.resolve(projectRoot, 'node_modules');
config.resolver.blockList = [
  new RegExp(
    path.join(localNodeModules, '@tanstack').replace(/\\/g, '\\\\') + '[\\\\/].*',
  ),
];

// Enable package exports for better module resolution
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = Array.from(
  new Set([...(config.resolver.unstable_conditionNames || []), '@tanstack/custom-condition']),
);

// Limit max workers to prevent "too many open files" error on Windows
config.maxWorkers = 1;

if (!fs.existsSync(tanstackReactQueryEntry) || !fs.existsSync(tanstackQueryCoreEntry)) {
  console.warn('[metro] TanStack source entry missing', {
    tanstackReactQueryEntry,
    tanstackQueryCoreEntry,
  });
}

module.exports = withNativewind(config);
