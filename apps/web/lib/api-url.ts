import { Capacitor } from "@capacitor/core";

const BACKEND_PORT = "3001";

const getHostBasedBackendUrl = () => {
  if (typeof window === "undefined") {
    return "";
  }

  const { protocol, hostname } = window.location;
  if (!hostname) {
    return "";
  }
  return `${protocol}//${hostname}:${BACKEND_PORT}`;
};

export const getApiBaseUrl = () => {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl) {
    return envUrl;
  }

  if (typeof window !== "undefined" && Capacitor.isNativePlatform()) {
    const hostBasedUrl = getHostBasedBackendUrl();
    if (hostBasedUrl) {
      return hostBasedUrl;
    }
  }

  return `http://localhost:${BACKEND_PORT}`;
};

export const getAppBaseUrl = () => {
  if (typeof window !== "undefined" && Capacitor.isNativePlatform()) {
    return window.location.origin;
  }

  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined" ? window.location.origin : "http://localhost:4000")
  );
};
