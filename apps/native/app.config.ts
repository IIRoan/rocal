import type { ExpoConfig } from "expo/config";

const { expo: appJsonConfig } = require("./app.json") as { expo: ExpoConfig };

const expoOwner = process.env.EXPO_OWNER || appJsonConfig.owner;
const expoProjectId =
  process.env.EXPO_PROJECT_ID || appJsonConfig.extra?.eas?.projectId;
const passkeyOrigin =
  process.env.PASSKEY_ORIGIN ||
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.EXPO_PUBLIC_APP_URL;
const passkeyAssociatedDomain = getPasskeyAssociatedDomain(passkeyOrigin);

function getPasskeyAssociatedDomain(origin?: string | null): string | null {
  if (!origin) {
    return null;
  }

  try {
    const hostname = new URL(origin).hostname.trim().toLowerCase();

    if (!hostname || hostname === "localhost" || isIpAddress(hostname)) {
      return null;
    }

    return hostname;
  } catch {
    return null;
  }
}

function isIpAddress(hostname: string): boolean {
  if (hostname.includes(":")) {
    return true;
  }

  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
}

function withoutPlugin(
  plugins: ExpoConfig["plugins"] | undefined,
  pluginName: string,
) {
  return (plugins ?? []).filter((plugin) => {
    if (typeof plugin === "string") {
      return plugin !== pluginName;
    }

    if (Array.isArray(plugin)) {
      return plugin[0] !== pluginName;
    }

    return true;
  });
}

const configuredPlugins = [
  ...withoutPlugin(
    withoutPlugin(appJsonConfig.plugins, "expo-web-browser"),
    "expo-build-properties",
  ),
  "expo-web-browser",
  [
    "expo-build-properties",
    {
      ios: {
        deploymentTarget: "15.1",
      },
      android: {
        compileSdkVersion: 34,
      },
    },
  ] as [
    string,
    {
      ios: { deploymentTarget: string };
      android: { compileSdkVersion: number };
    },
  ],
] satisfies NonNullable<ExpoConfig["plugins"]>;
const associatedDomains = Array.from(
  new Set([
    ...(appJsonConfig.ios?.associatedDomains ?? []),
    ...(passkeyAssociatedDomain
      ? [`webcredentials:${passkeyAssociatedDomain}`]
      : []),
  ]),
);

const config: ExpoConfig = {
  ...appJsonConfig,
  owner: expoOwner,
  plugins: configuredPlugins,
  ios: {
    ...appJsonConfig.ios,
    ...(associatedDomains.length > 0 ? { associatedDomains } : {}),
  },
  extra: {
    ...appJsonConfig.extra,
    eas: expoProjectId
      ? {
          ...(appJsonConfig.extra?.eas ?? {}),
          projectId: expoProjectId,
        }
      : appJsonConfig.extra?.eas,
  },
  updates: {
    ...appJsonConfig.updates,
    url: expoProjectId ? `https://u.expo.dev/${expoProjectId}` : undefined,
  },
};

export default config;
