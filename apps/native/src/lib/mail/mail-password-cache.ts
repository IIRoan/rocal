/**
 * Persists the user's login password in the platform-secure store so that
 * the mail vault can be unlocked even after the app is restarted (in-memory
 * `pendingAuthPasswordRef` in AuthProvider is lost on restart).
 *
 * The password is written on successful sign-in / sign-up and cleared on
 * sign-out. It is stored under `MAIL_VAULT_PASSWORD` in `expo-secure-store`
 * (iOS Keychain / Android Keystore) — never in plaintext storage.
 */
import * as SecureStore from "expo-secure-store";
import { createLogger } from "@workspace/logger";
import { SECURE_STORE_KEYS } from "../constants";

const log = createLogger("native:mail-password-cache");

/**
 * Saves the login password so the mail vault can be unlocked on future app
 * launches. Called by AuthProvider after a successful sign-in or sign-up.
 */
export async function saveMailVaultPassword(password: string): Promise<void> {
  if (!password) {
    log.debug("[mail-password-cache] saveMailVaultPassword: skipped — empty password");
    return;
  }
  try {
    await SecureStore.setItemAsync(SECURE_STORE_KEYS.MAIL_VAULT_PASSWORD, password);
    log.debug("[mail-password-cache] saveMailVaultPassword: saved to SecureStore (length=%d)", password.length);
  } catch (err) {
    // Non-fatal: the app still works, but mail vault may require re-auth
    log.warn(
      "[mail-password-cache] saveMailVaultPassword: failed to persist password:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Loads the persisted login password. Returns `null` if nothing is stored or
 * if SecureStore is unavailable.
 */
export async function loadMailVaultPassword(): Promise<string | null> {
  try {
    const value = await SecureStore.getItemAsync(SECURE_STORE_KEYS.MAIL_VAULT_PASSWORD);
    if (value) {
      log.debug("[mail-password-cache] loadMailVaultPassword: found stored password (length=%d)", value.length);
    } else {
      log.debug("[mail-password-cache] loadMailVaultPassword: no password stored");
    }
    return value;
  } catch (err) {
    log.warn(
      "[mail-password-cache] loadMailVaultPassword: failed to read from SecureStore:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/**
 * Clears the persisted password. Called by AuthProvider on sign-out.
 */
export async function clearMailVaultPassword(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.MAIL_VAULT_PASSWORD);
    log.debug("[mail-password-cache] clearMailVaultPassword: cleared from SecureStore");
  } catch (err) {
    log.warn(
      "[mail-password-cache] clearMailVaultPassword: failed to clear from SecureStore:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

// ---------------------------------------------------------------------------
// Derived vault key (pre-computed argon2id output)
// ---------------------------------------------------------------------------

/**
 * Caches the backend-computed vault decryption key (argon2id output).
 * Persisting this key in SecureStore avoids running argon2id locally on
 * subsequent app sessions — Hermes cannot run argon2id efficiently.
 */
export async function saveDerivedVaultKey(derivedKeyB64: string): Promise<void> {
  if (!derivedKeyB64) return;
  try {
    await SecureStore.setItemAsync(SECURE_STORE_KEYS.MAIL_VAULT_DERIVED_KEY, derivedKeyB64);
    log.debug("[mail-password-cache] saveDerivedVaultKey: saved to SecureStore");
  } catch (err) {
    log.warn(
      "[mail-password-cache] saveDerivedVaultKey: failed to persist:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Loads the cached vault decryption key. Returns `null` if not stored.
 */
export async function loadDerivedVaultKey(): Promise<string | null> {
  try {
    const value = await SecureStore.getItemAsync(SECURE_STORE_KEYS.MAIL_VAULT_DERIVED_KEY);
    if (value) {
      log.debug("[mail-password-cache] loadDerivedVaultKey: found cached derived key");
    } else {
      log.debug("[mail-password-cache] loadDerivedVaultKey: no cached derived key");
    }
    return value;
  } catch (err) {
    log.warn(
      "[mail-password-cache] loadDerivedVaultKey: failed to read:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/**
 * Clears the cached derived vault key. Called on sign-out.
 */
export async function clearDerivedVaultKey(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.MAIL_VAULT_DERIVED_KEY);
    log.debug("[mail-password-cache] clearDerivedVaultKey: cleared");
  } catch (err) {
    log.warn(
      "[mail-password-cache] clearDerivedVaultKey: failed:",
      err instanceof Error ? err.message : String(err),
    );
  }
}
