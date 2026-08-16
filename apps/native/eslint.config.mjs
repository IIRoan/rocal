import { defineConfig } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";

export default defineConfig([
  expoConfig,
  {
    files: ["scripts/**/*.ts"],
    languageOptions: {
      globals: {
        Bun: "readonly",
      },
    },
  },
  {
    rules: {
      "react/no-unescaped-entities": "off",
      // eslint-config-expo 57 pulls in eslint-plugin-react-hooks 7, whose
      // recommended set treats React Compiler rules as errors. Those rules
      // false-positive on Reanimated shared values and RNGH worklets, and
      // this app has not enabled experiments.reactCompiler yet.
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
  {
    ignores: [".expo/**", "coverage/**", "dist/**"],
  },
]);
