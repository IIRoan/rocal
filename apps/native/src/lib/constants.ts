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

export const APP_BASE_URL =
  process.env.EXPO_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? null;

/**
 * Secure-store keys used throughout the app.
 */
export const SECURE_STORE_KEYS = {
  SESSION_TOKEN: "SESSION_TOKEN",
  E2EE_DEVICE_ID: "E2EE_DEVICE_ID",
  E2EE_PRIVATE_KEY: "E2EE_PRIVATE_KEY",
  PUSH_TOKEN: "PUSH_TOKEN",
  THEME_PREFERENCE: "THEME_PREFERENCE",
  /** Login password persisted for mail vault decryption. Cleared on sign-out. */
  MAIL_VAULT_PASSWORD: "MAIL_VAULT_PASSWORD",
  /**
   * Pre-computed argon2id vault decryption key (32 bytes, base64url).
   * Provided by the backend to avoid running argon2id on the JS main thread.
   * Cleared on sign-out.
   */
  MAIL_VAULT_DERIVED_KEY: "MAIL_VAULT_DERIVED_KEY",
  /**
   * Number of chunks the cached decrypted PGP private key was split into.
   * The key is stored in 1 800-char chunks to stay under SecureStore's 2 KB
   * per-item limit. Cleared on sign-out.
   */
  MAIL_VAULT_PGP_KEY_COUNT: "MAIL_VAULT_PGP_KEY_COUNT",
  /**
   * Prefix for numbered chunk items: MAIL_VAULT_PGP_KEY_PART_0, _1, …
   * These hold the cached unprotected (passphrase-free) armored private key
   * so subsequent app sessions skip the ~14 s S2K derivation on Hermes.
   */
  MAIL_VAULT_PGP_KEY_PART: "MAIL_VAULT_PGP_KEY_PART_",
} as const;
