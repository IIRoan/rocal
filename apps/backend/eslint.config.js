import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  js.configs.recommended,
  eslintConfigPrettier,
  ...tseslint.configs.recommended,
  {
    ignores: [
      "__tests__/**",
      "coverage/**",
      "generated/**",
      "jest.config.cjs",
      "prisma/**",
      "server",
      "bun.lock",
    ],
  },
  {
    files: ["**/*.ts"],
    plugins: {
      sonarjs,
    },
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.es2024,
      },
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: dirname,
      },
    },
    rules: {
      "no-console": "off",
      "no-duplicate-imports": "error",
      eqeqeq: ["error", "always"],
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { varsIgnorePattern: "^logger$" },
      ],
      "no-case-declarations": "warn",
      "no-control-regex": "warn",
      "no-useless-escape": "warn",
      "prefer-const": "warn",
      "sonarjs/no-identical-functions": "error",
      "sonarjs/no-duplicated-branches": "error",
    },
  },
);
