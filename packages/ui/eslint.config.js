import { config } from "@workspace/eslint-config/react-internal"

/** @type {import("eslint").Linter.Config} */
export default [
  ...config,
  {
    ignores: ["coverage/**"],
  },
  {
    files: ["jest.config.cjs"],
    rules: {
      "no-undef": "off",
    },
  },
  {
    files: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]
