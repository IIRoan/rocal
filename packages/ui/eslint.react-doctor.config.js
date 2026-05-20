import { defineConfig } from "eslint/config";
import { advisoryReactDoctorConfigs } from "@workspace/eslint-config/react-doctor";
import baseConfig from "./eslint.config.js";

export default defineConfig([
  baseConfig,
  ...advisoryReactDoctorConfigs,
]);
