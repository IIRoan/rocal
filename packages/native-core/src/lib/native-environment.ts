import Constants from "expo-constants";
import settings from "../../expo-apps.json";

export function getNativeRuntimeEnvironment() {
  const value: unknown = Constants.expoConfig?.extra?.runtimeEnvironment;
  const environment =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  return {
    apiUrl:
      typeof environment.apiUrl === "string" && environment.apiUrl
        ? environment.apiUrl
        : settings.developmentApiUrl,
    appUrl:
      typeof environment.appUrl === "string" && environment.appUrl
        ? environment.appUrl
        : null,
  };
}
