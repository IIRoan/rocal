import { readEasUpdateTarget } from "./eas-build-profile";

export const INTERNAL_BUILD_PROFILES = ["development", "preview", "testing"] as const;
export type InternalBuildProfile = (typeof INTERNAL_BUILD_PROFILES)[number];
export type NativeReleaseProfile = InternalBuildProfile | "testflight" | "production";

export function resolveNativeReleaseProfile(input: {
  event: string;
  branch: string;
  defaultBranch: string;
  requested?: string;
  allowProduction: boolean;
}): NativeReleaseProfile {
  let profile: string | undefined;
  if (input.event === "pull_request") profile = "development";
  if (input.event === "push") {
    if (input.branch === input.defaultBranch) profile = "preview";
    else if (input.branch === "testing") profile = "testing";
  }
  if (input.event === "workflow_dispatch") profile = input.requested;
  if (profile !== "production" && profile !== "testflight" && !INTERNAL_BUILD_PROFILES.some((value) => value === profile)) {
    throw new Error("Choose a supported native release profile");
  }
  if (profile === "production" || profile === "testflight") {
    if (!input.allowProduction || input.event !== "workflow_dispatch" || input.branch !== input.defaultBranch) {
      throw new Error("Production releases require an explicit dispatch from the default branch");
    }
    return profile;
  }
  const internal = INTERNAL_BUILD_PROFILES.find((value) => value === profile);
  if (!internal) throw new Error("Unsupported internal release profile");
  return internal;
}

export function nativeReleaseProfileMetadata(value: unknown, profile: NativeReleaseProfile) {
  const target = readEasUpdateTarget(value, profile);
  if (!target || !target.env.APP_VARIANT || target.env.SOLACE_ENV_SOURCE !== "eas") {
    throw new Error(`Incomplete EAS release profile: ${profile}`);
  }
  return {
    channel: target.channel,
    environment: target.environment,
    app_variant: target.env.APP_VARIANT,
  };
}
