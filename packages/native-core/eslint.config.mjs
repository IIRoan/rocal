import { defineConfig } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";

export default defineConfig([
  expoConfig,
  {
    rules: {
      "react/no-unescaped-entities": "off",
      // React Compiler rules false-positive on Reanimated shared values and RNGH worklets.
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
  {
    ignores: ["coverage/**"],
  },
]);
