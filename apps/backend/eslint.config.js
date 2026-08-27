import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import { createApiContractPlugin } from "@workspace/eslint-config/api-contract";
import { createSafeLoggingPlugin } from "@workspace/eslint-config/safe-logging";
import globals from "globals";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";
import {
  LOG_HASH_FIELD_KEYS,
  LOG_OMIT_FIELD_KEYS,
  LOG_SAFE_VALUE_CALLEES,
  LOG_URL_FIELD_KEYS,
} from "./contracts/logging.policy.mjs";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const safeLogging = createSafeLoggingPlugin({
  omitKeys: LOG_OMIT_FIELD_KEYS,
  hashKeys: LOG_HASH_FIELD_KEYS,
  urlKeys: LOG_URL_FIELD_KEYS,
  safeValueCallees: LOG_SAFE_VALUE_CALLEES,
});
const apiContract = createApiContractPlugin();

export default tseslint.config(
  js.configs.recommended,
  eslintConfigPrettier,
  ...tseslint.configs.recommended,
  {
    ignores: [
      "__tests__/**",
      "coverage/**",
      "dist/**",
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
      "safe-logging": safeLogging,
      "api-contract": apiContract,
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
      "safe-logging/no-raw-error-logging": "error",
      "safe-logging/no-sensitive-log-keys": "error",
      "safe-logging/no-error-string-in-logs": "error",
      "api-contract/use-route-model-schemas": "error",
      "api-contract/require-route-models-plugin": "error",
      "api-contract/require-service-contract": "error",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "zod",
              message:
                "Define request/response schemas in apps/backend/contracts/, not in routes or services.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["routes/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "zod",
              message:
                "Define request/response schemas in apps/backend/contracts/, not in routes.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["contracts/**/*.ts", "lib/validation.ts", "lib/**/*.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    files: ["services/mail-realtime.service.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    files: ["contracts/**/*.ts"],
    rules: {
      "api-contract/use-route-model-schemas": "off",
      "api-contract/require-route-models-plugin": "off",
      "api-contract/require-service-contract": "off",
    },
  },
  {
    files: [
      "lib/log-sanitization.ts",
      "contracts/logging.contract.ts",
      "contracts/logging.policy.mjs",
    ],
    rules: {
      "safe-logging/no-raw-error-logging": "off",
      "safe-logging/no-sensitive-log-keys": "off",
      "safe-logging/no-error-string-in-logs": "off",
    },
  },
);
