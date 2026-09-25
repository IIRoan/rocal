import Constants from "expo-constants";

/** Official Sentry SDKs need a numeric project id; errex uses a string name + tunnel. */
export function parseErrexDsn(raw: string): {
  key: string;
  host: string;
  project: string;
} | null {
  try {
    const url = new URL(raw);
    const key = url.username.trim();
    const host = url.host.trim();
    const project = url.pathname.replace(/^\/+|\/+$/g, "").trim();
    if (!key || !host || !project) {
      return null;
    }
    return { key, host, project };
  } catch {
    return null;
  }
}

export type ErrexReportingOptions = {
  tunnel: string;
  environment: string;
};

function resolveEnvironment(): string {
  const fromExtra = (
    Constants.expoConfig?.extra as { appVariant?: string } | undefined
  )?.appVariant?.trim();
  if (fromExtra) return fromExtra;
  const fromEnv = process.env.APP_VARIANT?.trim();
  if (fromEnv) return fromEnv;
  const isDev =
    typeof __DEV__ !== "undefined"
      ? __DEV__
      : process.env.NODE_ENV !== "production";
  return isDev ? "development" : "production";
}

export function getErrexReportingOptions(
  rawDsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim() ?? "",
): ErrexReportingOptions | null {
  if (!rawDsn) {
    return null;
  }

  const parsed = parseErrexDsn(rawDsn);
  if (!parsed) {
    return null;
  }

  const { key, host, project } = parsed;

  return {
    tunnel: `https://${host}/api/${encodeURIComponent(project)}/envelope/?sentry_key=${encodeURIComponent(key)}`,
    environment: resolveEnvironment(),
  };
}
