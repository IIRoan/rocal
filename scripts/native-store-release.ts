import settings from "../packages/native-core/expo-apps.json";
import listings from "../packages/native-core/store-listings.json";
import product from "../packages/calendar-core/src/product-info.json";
import { nativeReleaseProfileMetadata } from "./native-release-config";

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected EAS release metadata");
  }
  return value as Record<string, unknown>;
}

export function prepareStoreRelease(
  value: unknown,
  app: string,
  profile: string,
  eas: unknown,
) {
  if (app !== "calendar" && app !== "mail")
    throw new Error("Choose calendar or mail");
  if (profile !== "testflight" && profile !== "production")
    throw new Error("Choose a store profile");
  const { channel } = nativeReleaseProfileMetadata(eas, profile);
  const config = object(value);
  const appConfig = object(config.appConfig);
  const extra = object(appConfig.extra);
  const identity = settings.apps[app];
  if (
    object(extra.eas).projectId !== identity.projectId ||
    object(appConfig.ios).bundleIdentifier !== identity.bundleIdentifier ||
    appConfig.version !== settings.version ||
    object(config.buildProfile).channel !== channel ||
    object(config.buildProfile).distribution !== "store"
  ) {
    throw new Error(
      "Store configuration does not match the selected app/profile",
    );
  }
  const appUrl = object(extra.runtimeEnvironment).appUrl;
  if (typeof appUrl !== "string")
    throw new Error("A public support/privacy website is required");
  const website = new URL(appUrl);
  if (website.protocol !== "https:" || website.username || website.password) {
    throw new Error("The public website must use HTTPS without credentials");
  }
  return {
    release: {
      app,
      projectId: identity.projectId,
      appIdentifier: identity.bundleIdentifier,
      appVersion: settings.version,
      buildProfile: profile,
      channel,
    },
    draft: {
      configVersion: 0,
      apple: {
        version: settings.version,
        info: {
          "en-US": {
            title: identity.name,
            ...listings[app],
            marketingUrl: website.origin,
            supportUrl: website.origin + product.supportPath,
            privacyPolicyUrl: website.origin + product.privacyPath,
          },
        },
      },
    },
  };
}
