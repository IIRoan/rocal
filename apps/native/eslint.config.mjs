import { defineConfig } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";

export default defineConfig([
  expoConfig,
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        Bun: "readonly",
      },
    },
  },
  {
    rules: {
      "react/no-unescaped-entities": "off",
    },
  },
  {
    ignores: [".expo/**", "coverage/**", "dist/**"],
  },
]);
