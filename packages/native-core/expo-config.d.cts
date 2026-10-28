import type { ExpoConfig } from "expo/config";

export function createNativeExpoConfig(
  app: "calendar" | "mail",
  environment?: Readonly<Record<string, string | undefined>>,
): ExpoConfig;

export function validateNativeBuildEnvironment(
  environment?: Readonly<Record<string, string | undefined>>,
): void;
