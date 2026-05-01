import type { ExpoConfig } from "expo/config";

const { expo: appJsonConfig } = require("./app.json") as { expo: ExpoConfig };

const expoOwner = process.env.EXPO_OWNER || appJsonConfig.owner;
const expoProjectId =
  process.env.EXPO_PROJECT_ID || appJsonConfig.extra?.eas?.projectId;

const config: ExpoConfig = {
  ...appJsonConfig,
  owner: expoOwner,
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
