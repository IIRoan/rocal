import js from "@eslint/js"
import eslintConfigPrettier from "eslint-config-prettier"
import pluginReact from "eslint-plugin-react"
import pluginReactHooks from "eslint-plugin-react-hooks"
import globals from "globals"
import tseslint from "typescript-eslint"

import { config as baseConfig } from "./base.js"

/**
 * A custom ESLint configuration for libraries that use React.
 *
 * @type {import("eslint").Linter.Config} */
export const config = [
  ...baseConfig,
  js.configs.recommended,
  eslintConfigPrettier,
  ...tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  {
    languageOptions: {
      ...pluginReact.configs.flat.recommended.languageOptions,
      globals: {
        ...globals.serviceworker,
        ...globals.browser,
      },
    },
  },
  {
    plugins: {
      "react-hooks": pluginReactHooks,
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...pluginReactHooks.configs.recommended.rules,
      // React scope no longer necessary with new JSX transform.
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      // Disable unused variable warnings
      "@typescript-eslint/no-unused-vars": "off",
      // Allow explicit any type
      "@typescript-eslint/no-explicit-any": "off",
      // Allow unescaped entities in JSX
      "react/no-unescaped-entities": "off",
      // Allow lexical declarations in case blocks
      "no-case-declarations": "off",
      // Allow unknown properties (for SVG attributes)
      "react/no-unknown-property": "off",
      // Disable exhaustive-deps warnings
      "react-hooks/exhaustive-deps": "off",
    },
  },
]
