# Metro Configuration in Bun Monorepos

When configuring Metro in a Bun monorepo, avoid watching the entire `workspaceRoot` as it can cause performance issues or "too many open files" errors. Instead, specifically watch the `workspacePackages` being used, the `workspaceNodeModules`, and the `.bun` store.

Example snippet for `metro.config.js`:
```javascript
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Get workspace package paths
const workspacePackages = [
  path.resolve(workspaceRoot, "packages/ui"),
];

const workspaceNodeModules = path.resolve(workspaceRoot, "node_modules");
const bunStore = path.resolve(process.env.USERPROFILE || process.env.HOME, ".bun/install/cache");

config.watchFolders = [...workspacePackages, workspaceNodeModules, bunStore];
```
