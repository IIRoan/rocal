import type { ExpoConfig } from "expo/config";

const variant = process.env.APP_VARIANT ?? "production";
const isDev = variant === "development";
const iosBundleIdentifier = isDev ? "onl.solace.calendar.dev" : "onl.solace.calendar";
const IOS_DEPLOYMENT_TARGET = "16.4";

// The App Group id doubles as the keychain access group shared with the notification extension.
const notificationExtension = {
  targetName: "SolaceNotificationService",
  bundleIdentifier: `${iosBundleIdentifier}.NotificationService`,
  appGroup: `group.${iosBundleIdentifier}`,
  keychainService: "onl.solace.notification-extension",
};

const baseConfig = {
  name: isDev ? "Calendar Dev" : "Solace Calendar",
  slug: "solace",
  version: "1.0.0",
  orientation: "portrait",
  icon: isDev ? "./assets/icon-dev.png" : "./assets/icon.png",
  scheme: isDev ? "solace-dev" : "solace",
  userInterfaceStyle: "automatic",
  // Prefer a stable runtime so OTAs keep matching installed binaries.
  // Override with EAS_UPDATE_RUNTIME_VERSION when publishing for an existing
  // fingerprint-based build (see scripts/publish-update.ts).
  runtimeVersion:
    process.env.EAS_UPDATE_RUNTIME_VERSION?.trim() ||
    ({
      policy: "appVersion",
    } as const),
  updates: {
    enabled: true,
    checkAutomatically: "NEVER",
    fallbackToCacheTimeout: 0,
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: iosBundleIdentifier,
    buildNumber: "1",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: isDev ? "onl.solace.calendar.dev" : "onl.solace.calendar",
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: isDev
        ? "./assets/adaptive-icon-dev.png"
        : "./assets/adaptive-icon.png",
      backgroundColor: "#2d2d2d",
    },
  },
  plugins: [
    "expo-router",
    ...(isDev
      ? ([["expo-dev-client", { addGeneratedScheme: true }]] as [
        string,
        { addGeneratedScheme: boolean },
      ][])
      : []),
    "expo-secure-store",
    "expo-notifications",
    [
      "expo-splash-screen",
      {
        image: isDev
          ? "./assets/splash-icon-dev.png"
          : "./assets/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#fafafa",
        dark: {
          backgroundColor: "#2d2d2d",
        },
      },
    ],
    "expo-web-browser",
    "expo-updates",
    "expo-sharing",
    "expo-status-bar",
    "react-native-quick-crypto",
    [
      "../../packages/native-core/plugins/notification-service-extension/index.js",
      {
        appGroup: notificationExtension.appGroup,
        keychainService: notificationExtension.keychainService,
        deploymentTarget: IOS_DEPLOYMENT_TARGET,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    autolinkingModuleResolution: true,
  },
  extra: {
    eas: {
      projectId: "1047b680-b99f-4671-9824-23b9a0487125",
      build: {
        experimental: {
          ios: {
            appExtensions: [
              {
                targetName: notificationExtension.targetName,
                bundleIdentifier: notificationExtension.bundleIdentifier,
                entitlements: {
                  "com.apple.security.application-groups": [
                    notificationExtension.appGroup,
                  ],
                },
              },
            ],
          },
        },
      },
    },
    appVariant: variant,
    notificationExtension: {
      appGroup: notificationExtension.appGroup,
      keychainService: notificationExtension.keychainService,
    },
  },
  owner: "astralgrove",
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
        deploymentTarget: IOS_DEPLOYMENT_TARGET,
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
