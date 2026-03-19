import { defineConfig, globalIgnores } from "eslint/config";
import { config as baseConfig } from "./packages/eslint-config/base.js";

export default defineConfig([
  ...baseConfig,
  globalIgnores(["apps/**", "packages/**"]),
]);
