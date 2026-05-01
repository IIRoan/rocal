export const APP_SCHEME = "solace";
export const AUTH_STORAGE_PREFIX = "solace";

/**
 * Base URL for the Backend API.
 *
 * In development this points at the local backend server.
 * For production builds, replace with the production URL or read from
 * an environment variable / Expo Constants config.
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4001";

/**
 * Secure-store keys used throughout the app.
 */
export const SECURE_STORE_KEYS = {
  SESSION_TOKEN: "SESSION_TOKEN",
  E2EE_DEVICE_ID: "E2EE_DEVICE_ID",
  E2EE_PRIVATE_KEY: "E2EE_PRIVATE_KEY",
  PUSH_TOKEN: "PUSH_TOKEN",
  THEME_PREFERENCE: "THEME_PREFERENCE",
} as const;
