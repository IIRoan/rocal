import type { ExpoConfig } from "expo/config";

const baseConfig = {
  name: "Solace",
  slug: "solace",
  version: "1.0.0",
  orientation: "portrait",
  scheme: "solace",
  newArchEnabled: true,
  userInterfaceStyle: "automatic",
  runtimeVersion: {
    policy: "appVersion",
  },
  updates: {
    checkAutomatically: "ON_LOAD",
    fallbackToCacheTimeout: 0,
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "onl.solace.mobile",
    buildNumber: "1",
  },
  android: {
    package: "onl.solace.mobile",
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: "#ffffff",
    },
  },
  plugins: ["expo-router", "expo-secure-store"],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: "1047b680-b99f-4671-9824-23b9a0487125",
    },
  },
  owner: "iroan",
} as ExpoConfig;

const expoOwner = process.env.EXPO_OWNER || baseConfig.owner;
const expoProjectId =
  process.env.EXPO_PROJECT_ID || baseConfig.extra?.eas?.projectId;
const enableIosAssociatedDomains =
  process.env.EXPO_ENABLE_IOS_ASSOCIATED_DOMAINS === "true";
const passkeyOrigin =
  process.env.PASSKEY_ORIGIN ||
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.EXPO_PUBLIC_APP_URL;
const passkeyAssociatedDomain = enableIosAssociatedDomains
  ? getPasskeyAssociatedDomain(passkeyOrigin)
  : null;

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
    withoutPlugin(baseConfig.plugins, "expo-web-browser"),
    "expo-build-properties",
  ),
  "expo-web-browser",
  [
    "expo-build-properties",
    {
      ios: {
        deploymentTarget: "15.1",
      },
    },
  ] as [string, { ios: { deploymentTarget: string } }],
] satisfies NonNullable<ExpoConfig["plugins"]>;
const associatedDomains = Array.from(
  new Set([
    ...(baseConfig.ios?.associatedDomains ?? []),
    ...(passkeyAssociatedDomain
      ? [`webcredentials:${passkeyAssociatedDomain}`]
      : []),
  ]),
);

const config: ExpoConfig = {
  ...baseConfig,
  owner: expoOwner,
  plugins: configuredPlugins,
  ios: {
    ...baseConfig.ios,
    ...(associatedDomains.length > 0 ? { associatedDomains } : {}),
  },
  extra: {
    ...baseConfig.extra,
    eas: expoProjectId
      ? {
          ...(baseConfig.extra?.eas ?? {}),
          projectId: expoProjectId,
        }
      : baseConfig.extra?.eas,
  },
  updates: {
    ...baseConfig.updates,
    url: expoProjectId ? `https://u.expo.dev/${expoProjectId}` : undefined,
  },
};

export default config;
