import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import settings from "../packages/native-core/expo-apps.json";
import { nativeReleaseProfileMetadata, resolveNativeReleaseProfile } from "./native-release-config";

const root = resolve(import.meta.dir, "..");
const profile = resolveNativeReleaseProfile({
  event: process.env.GITHUB_EVENT_NAME ?? "",
  branch: process.env.GITHUB_REF_NAME ?? "",
  defaultBranch: process.env.DEFAULT_BRANCH ?? "",
  requested: process.env.INPUT_PROFILE,
  allowProduction: process.env.ALLOW_PRODUCTION === "true",
  dryRun: process.env.DRY_RUN === "true",
});
const selectedApp = process.env.INPUT_APP || "all";
const apps = Object.entries(settings.apps).filter(([app]) => selectedApp === "all" || selectedApp === app);
if (apps.length === 0) throw new Error("Choose calendar, mail or all");
const include = apps.map(([app, identity]) => {
  const dir = `apps/native-${app}`;
  const eas: unknown = JSON.parse(readFileSync(resolve(root, dir, "eas.json"), "utf8"));
  return { app, dir, name: identity.name, ...nativeReleaseProfileMetadata(eas, profile) };
});
const output = {
  profile,
  title_suffix: profile === "development" ? "Dev" : profile.charAt(0).toUpperCase() + profile.slice(1),
  eas_version: settings.easCliVersion,
  matrix: JSON.stringify({ include }),
};
const lines = Object.entries(output).map(([key, value]) => `${key}=${value}`).join("\n") + "\n";
if (!process.env.GITHUB_OUTPUT) throw new Error("GITHUB_OUTPUT is required");
appendFileSync(process.env.GITHUB_OUTPUT, lines);
console.log(JSON.stringify(output, null, 2));
