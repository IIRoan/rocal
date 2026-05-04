const AUTH_REDIRECT_FALLBACK_PATH = "/dashboard";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function isLoopbackHost(hostname?: string | null) {
  return Boolean(hostname && LOOPBACK_HOSTS.has(hostname.toLowerCase()));
}

function getBrowserOriginUrl() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return new URL(window.location.origin);
  } catch {
    return null;
  }
}

function remapLoopbackUrlForBrowser(urlString: string): string {
  const browserOrigin = getBrowserOriginUrl();

  if (!browserOrigin) {
    return urlString;
  }

  try {
    const configuredUrl = new URL(urlString);

    if (
      isLoopbackHost(configuredUrl.hostname) &&
      !isLoopbackHost(browserOrigin.hostname)
    ) {
      configuredUrl.protocol = browserOrigin.protocol;
      configuredUrl.hostname = browserOrigin.hostname;
      return configuredUrl.toString().replace(/\/$/, "");
    }

    return urlString;
  } catch {
    return urlString;
  }
}

/**
 * Resolve the API base URL.
 *
 * Priority: NEXT_PUBLIC_API_URL env var → env fallback.
 */
export const getApiBaseUrl = () => {
  const configuredUrl = process.env.NEXT_PUBLIC_API_URL;

  if (configuredUrl) {
    return remapLoopbackUrlForBrowser(configuredUrl);
  }

  const browserOrigin = getBrowserOriginUrl();
  if (browserOrigin && !isLoopbackHost(browserOrigin.hostname)) {
    const apiUrl = new URL(browserOrigin.origin);
    apiUrl.port = "4001";
    return apiUrl.toString().replace(/\/$/, "");
  }

  return "http://localhost:4001";
};

/**
 * Resolve the app (frontend) base URL.
 *
 * Priority: NEXT_PUBLIC_APP_URL → browser origin → env fallback.
 */
export const getAppBaseUrl = () => {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (configuredUrl) {
    return remapLoopbackUrlForBrowser(configuredUrl);
  }

  return (
    (typeof window !== "undefined" ? window.location.origin : null) ||
    "http://localhost:4000"
  );
};

const toSafeRelativePath = (path?: string | null) => {
  if (!path || !path.startsWith("/")) {
    return AUTH_REDIRECT_FALLBACK_PATH;
  }

  return path;
};

const toOrigin = (value?: string | null) => {
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

export const getAuthCallbackUrl = (nextPath?: string | null) => {
  const safePath = toSafeRelativePath(nextPath);
  return new URL(safePath, getAppBaseUrl()).toString();
};

export const getAuthErrorCallbackUrl = (nextPath?: string | null) => {
  return getAuthCallbackUrl(nextPath);
};

export const getSafeAuthCallbackUrl = (callbackUrl?: string | null) => {
  if (!callbackUrl) return null;

  try {
    const resolvedUrl = new URL(callbackUrl, getAppBaseUrl());
    const allowedOrigins = new Set(
      [
        getAppBaseUrl(),
        getApiBaseUrl(),
        process.env.NEXT_PUBLIC_APP_URL,
        process.env.NEXT_PUBLIC_API_URL,
      ]
        .map((value) => toOrigin(value))
        .filter((value): value is string => Boolean(value)),
    );

    if (!allowedOrigins.has(resolvedUrl.origin)) {
      return null;
    }

    return resolvedUrl.toString();
  } catch {
    return null;
  }
};

export const resolveAuthRedirectTarget = (
  nextPath?: string | null,
  callbackUrl?: string | null,
) => {
  const safeCallbackUrl = getSafeAuthCallbackUrl(callbackUrl);

  if (safeCallbackUrl) {
    const appOrigin = toOrigin(getAppBaseUrl());
    const callbackOrigin = toOrigin(safeCallbackUrl);

    if (appOrigin && callbackOrigin && appOrigin === callbackOrigin) {
      const callbackTarget = new URL(safeCallbackUrl);
      return {
        href: `${callbackTarget.pathname}${callbackTarget.search}${callbackTarget.hash}`,
        external: false,
      };
    }

    return {
      href: safeCallbackUrl,
      external: true,
    };
  }

  return {
    href: toSafeRelativePath(nextPath),
    external: false,
  };
};
