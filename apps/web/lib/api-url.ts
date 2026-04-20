import { Capacitor } from "@capacitor/core";

const BACKEND_PORT = "3001";
const DEFAULT_APP_URL = "http://localhost:3000";
const DEFAULT_MOBILE_AUTH_CALLBACK_URL = "app.solace.onl://api/auth";
const AUTH_REDIRECT_FALLBACK_PATH = "/dashboard";
const MOBILE_AUTH_BRIDGE_PATH = "/auth/mobile-complete";

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

export const getApiBaseUrl = () => {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl) {
    return envUrl;
  }

  if (typeof window !== "undefined" && Capacitor.isNativePlatform()) {
    return `${window.location.protocol}//${window.location.hostname}:${BACKEND_PORT}`;
  }

  return `http://localhost:${BACKEND_PORT}`;
};

export const getAppBaseUrl = () => {
  if (typeof window !== "undefined" && Capacitor.isNativePlatform()) {
    return window.location.origin;
  }

  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined" ? window.location.origin : DEFAULT_APP_URL)
  );
};

export const getMobileAuthCallbackBaseUrl = () => {
  return (
    process.env.NEXT_PUBLIC_MOBILE_AUTH_CALLBACK_URL ||
    DEFAULT_MOBILE_AUTH_CALLBACK_URL
  );
};

export const getMobileAuthCallbackUrl = (
  nextPath?: string | null,
  errorCode?: string,
  oneTimeToken?: string,
) => {
  const safePath = toSafeRelativePath(nextPath);
  const callbackBaseUrl = getMobileAuthCallbackBaseUrl();

  try {
    const callbackUrl = new URL(callbackBaseUrl);
    callbackUrl.searchParams.set("next", safePath);
    if (errorCode) {
      callbackUrl.searchParams.set("error", errorCode);
    }
    if (oneTimeToken) {
      callbackUrl.searchParams.set("ott", oneTimeToken);
    }
    return callbackUrl.toString();
  } catch {
    const params = new URLSearchParams({ next: safePath });
    if (errorCode) {
      params.set("error", errorCode);
    }
    if (oneTimeToken) {
      params.set("ott", oneTimeToken);
    }
    return `${DEFAULT_MOBILE_AUTH_CALLBACK_URL}?${params.toString()}`;
  }
};

export const getMobileAuthBridgeUrl = (
  nextPath?: string | null,
  errorCode?: string,
) => {
  const safePath = toSafeRelativePath(nextPath);
  const bridgeUrl = new URL(
    MOBILE_AUTH_BRIDGE_PATH,
    getAppBaseUrl(),
  );
  bridgeUrl.searchParams.set("next", safePath);

  if (errorCode) {
    bridgeUrl.searchParams.set("error", errorCode);
  }

  return bridgeUrl.toString();
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
