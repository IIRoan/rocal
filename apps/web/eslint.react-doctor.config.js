import { defineConfig } from "eslint/config";
import { advisoryNextReactDoctorConfigs } from "@workspace/eslint-config/react-doctor";
import baseConfig from "./eslint.config.js";

export default defineConfig([
  baseConfig,
  ...advisoryNextReactDoctorConfigs,
]);
