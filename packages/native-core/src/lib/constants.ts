import Constants from "expo-constants";

function firstScheme(scheme: unknown): string | null {
  if (typeof scheme === "string" && scheme.length > 0) {
    return scheme;
  }

  if (
    Array.isArray(scheme) &&
    typeof scheme[0] === "string" &&
    scheme[0].length > 0
  ) {
    return scheme[0];
  }

  return null;
}

/** Deep-link scheme for this binary (`solace` or `solace-dev`). */
export const APP_SCHEME = firstScheme(Constants.expoConfig?.scheme) ?? "solace";
export const AUTH_STORAGE_PREFIX = "solace";

/** Backend API base URL; dev defaults to localhost, production comes from EXPO_PUBLIC_API_URL. */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4001";

export const APP_BASE_URL =
  process.env.EXPO_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? null;

/** Secure-store keys used throughout the app. */
export const SECURE_STORE_KEYS = {
  SESSION_TOKEN: "SESSION_TOKEN",
  E2EE_DEVICE_ID: "E2EE_DEVICE_ID",
  E2EE_PRIVATE_KEY: "E2EE_PRIVATE_KEY",
  PUSH_TOKEN: "PUSH_TOKEN",
  THEME_PREFERENCE: "THEME_PREFERENCE",
  /** Login password persisted for mail vault decryption. Cleared on sign-out. */
  MAIL_VAULT_PASSWORD: "MAIL_VAULT_PASSWORD",
  /** Backend-precomputed argon2id vault key (32 bytes, base64url), avoiding a JS-thread KDF; cleared on sign-out. */
  MAIL_VAULT_DERIVED_KEY: "MAIL_VAULT_DERIVED_KEY",
  /** Chunk count for the cached PGP key (1 800-char chunks under SecureStore's 2 KB limit); cleared on sign-out. */
  MAIL_VAULT_PGP_KEY_COUNT: "MAIL_VAULT_PGP_KEY_COUNT",
  /** Chunk prefix for the passphrase-free armored key, so later sessions skip the ~14 s S2K derivation on Hermes. */
  MAIL_VAULT_PGP_KEY_PART: "MAIL_VAULT_PGP_KEY_PART_",
  HIDDEN_MAILBOX_IDS: "HIDDEN_MAILBOX_IDS",
  /** Reader remote-content policy and trusted senders. Cleared on sign-out. */
  MAIL_DISPLAY_SETTINGS: "MAIL_DISPLAY_SETTINGS",
  /** Compose preferences (plain text, signature, attachment reminder). Cleared on sign-out. */
  MAIL_COMPOSE_SETTINGS: "MAIL_COMPOSE_SETTINGS",
  /** Message list density, read delay, and undo duration. Cleared on sign-out. */
  MAIL_LIST_SETTINGS: "MAIL_LIST_SETTINGS",
  SEARCH_INDEX_KEY: "SEARCH_INDEX_KEY",
  /** AES-GCM key for the on-device mailbox snapshot. Cleared on sign-out. */
  MAIL_OFFLINE_CACHE_KEY: "MAIL_OFFLINE_CACHE_KEY",
  SEARCH_INDEX_ENABLED: "SEARCH_INDEX_ENABLED",
} as const;
