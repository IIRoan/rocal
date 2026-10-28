const settings = require("./expo-apps.json");

function getPasskeyAssociatedDomain(origin) {
  if (!origin) return null;
  try {
    const hostname = new URL(origin).hostname.trim().toLowerCase();
    if (!hostname || hostname === "localhost" || hostname.includes(":"))
      return null;
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return null;
    return hostname;
  } catch {
    return null;
  }
}

function createNativeExpoConfig(app, environment = process.env) {
  const identity = settings.apps[app];
  if (!identity) throw new Error("Unknown native app configuration");
  const variant = environment.APP_VARIANT ?? "production";
  if (!["development", "preview", "production"].includes(variant)) {
    throw new Error("APP_VARIANT must be development, preview or production");
  }
  const isDev = variant === "development";
  const bundleIdentifier = `${identity.bundleIdentifier}${isDev ? ".dev" : ""}`;
  const projectId = environment.EXPO_PROJECT_ID?.trim() || identity.projectId;
  const owner = environment.EXPO_OWNER?.trim() || settings.owner;
  const slug = environment.EXPO_PROJECT_SLUG?.trim() || identity.slug;
  const fromEas = environment.SOLACE_ENV_SOURCE === "eas";
  const apiUrl = fromEas
    ? environment.SOLACE_API_URL
    : environment.EXPO_PUBLIC_API_URL || environment.SOLACE_API_URL;
  const appUrl = fromEas
    ? environment.SOLACE_APP_URL || null
    : environment.EXPO_PUBLIC_APP_URL ||
      environment.NEXT_PUBLIC_APP_URL ||
      environment.SOLACE_APP_URL ||
      null;
  const passkeyOrigin = fromEas
    ? appUrl
    : environment.PASSKEY_ORIGIN || environment.NEXT_PUBLIC_APP_URL || appUrl;
  const associatedDomainsEnabled =
    (fromEas
      ? environment.SOLACE_ENABLE_IOS_ASSOCIATED_DOMAINS
      : environment.EXPO_ENABLE_IOS_ASSOCIATED_DOMAINS ||
        environment.SOLACE_ENABLE_IOS_ASSOCIATED_DOMAINS) === "true";
  const associatedDomain = associatedDomainsEnabled
    ? getPasskeyAssociatedDomain(passkeyOrigin)
    : null;
  const notificationExtension = {
    targetName: settings.notificationExtensionTargetName,
    bundleIdentifier: `${bundleIdentifier}.${settings.notificationExtensionBundleSuffix}`,
    appGroup: `group.${bundleIdentifier}`,
    keychainService: settings.notificationKeychainService,
  };
  const developmentScheme = `${identity.scheme}-dev`;
  const scheme = isDev
    ? identity.legacyDevelopmentScheme
      ? [developmentScheme, identity.legacyDevelopmentScheme]
      : developmentScheme
    : identity.scheme;

  return {
    name: isDev ? identity.developmentName : identity.name,
    slug,
    version: settings.version,
    orientation: "portrait",
    icon: isDev ? "./assets/icon-dev.png" : "./assets/icon.png",
    scheme,
    userInterfaceStyle: "automatic",
    runtimeVersion: environment.EAS_UPDATE_RUNTIME_VERSION?.trim() || {
      policy: "appVersion",
    },
    updates: {
      enabled: true,
      checkAutomatically: "NEVER",
      fallbackToCacheTimeout: 0,
      url: `https://u.expo.dev/${projectId}`,
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier,
      buildNumber: String(settings.initialBuildNumber),
      infoPlist: { ITSAppUsesNonExemptEncryption: false },
      ...(associatedDomain
        ? { associatedDomains: [`webcredentials:${associatedDomain}`] }
        : {}),
    },
    android: {
      package: bundleIdentifier,
      versionCode: settings.initialBuildNumber,
      adaptiveIcon: {
        foregroundImage: isDev
          ? "./assets/adaptive-icon-dev.png"
          : "./assets/adaptive-icon.png",
        backgroundColor: "#2d2d2d",
      },
    },
    plugins: [
      "expo-router",
      ...(isDev ? [["expo-dev-client", { addGeneratedScheme: true }]] : []),
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
          dark: { backgroundColor: "#111111" },
        },
      ],
      "expo-updates",
      "expo-sharing",
      [
        "expo-image-picker",
        {
          photosPermission:
            "Solace uses your photo library only when you choose a profile picture.",
          cameraPermission: false,
          microphonePermission: false,
        },
      ],
      "expo-status-bar",
      "react-native-quick-crypto",
      [
        "../../packages/native-core/plugins/notification-service-extension/index.js",
        {
          appGroup: notificationExtension.appGroup,
          keychainService: notificationExtension.keychainService,
          deploymentTarget: settings.iosDeploymentTarget,
        },
      ],
      "expo-web-browser",
      [
        "expo-build-properties",
        { ios: { deploymentTarget: settings.iosDeploymentTarget } },
      ],
    ],
    experiments: {
      typedRoutes: true,
      ...(identity.reactCompiler ? { reactCompiler: true } : {}),
      autolinkingModuleResolution: true,
    },
    owner,
    extra: {
      eas: {
        projectId,
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
      runtimeEnvironment: {
        apiUrl: apiUrl || settings.developmentApiUrl,
        appUrl,
        sentryDsn: fromEas
          ? (environment.SOLACE_SENTRY_DSN ?? null)
          : (environment.EXPO_PUBLIC_SENTRY_DSN ??
            environment.SOLACE_SENTRY_DSN ??
            null),
      },
    },
  };
}

function validateNativeBuildEnvironment(environment = process.env) {
  if (!environment.SOLACE_API_URL?.trim()) {
    throw new Error("SOLACE_API_URL is required for EAS builds and updates");
  }
  if (
    environment.APP_VARIANT !== "development" &&
    !environment.SOLACE_APP_URL?.trim()
  ) {
    throw new Error("SOLACE_APP_URL is required for preview and production");
  }
}

if (require.main === module && process.argv.includes("--check-environment")) {
  validateNativeBuildEnvironment();
}

module.exports = { createNativeExpoConfig, validateNativeBuildEnvironment };
