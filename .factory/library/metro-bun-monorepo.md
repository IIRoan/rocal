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

## TypeScript Configuration for Workspace Aliases

When using workspace aliases (e.g. `@workspace/ui/*`) to import `.native.tsx` components into the React Native app, do NOT explicitly include the `.native` extension in the import path. Metro handles this resolution automatically.

However, to prevent TypeScript compilation errors, you must map the alias to both `.native.tsx` and `.tsx` fallbacks in the mobile app's `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@workspace/ui/*": [
        "../../packages/ui/src/*",
        "../../packages/ui/src/*.native.tsx",
        "../../packages/ui/src/*.tsx"
      ]
    }
  }
}
```
