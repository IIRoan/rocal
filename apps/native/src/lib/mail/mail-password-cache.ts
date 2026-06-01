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

// ---------------------------------------------------------------------------
// Decrypted PGP private key cache (chunked — SecureStore limit is ~2 KB/item)
// ---------------------------------------------------------------------------

const PGP_KEY_CHUNK_SIZE = 1800;

/**
 * Caches the unprotected (passphrase-free) armored PGP private key.
 *
 * The key is stored in 1 800-char chunks so no single item exceeds SecureStore's
 * ~2 KB limit. On the next app session, the cached key is used directly —
 * skipping the ~14 s S2K derivation that happens when decrypting an
 * encrypted PGP key on Hermes.
 *
 * The key is protected at rest by the iOS Keychain / Android Keystore.
 */
export async function saveCachedPrivateKey(armoredKey: string): Promise<void> {
  if (!armoredKey) return;
  try {
    const chunks: string[] = [];
    for (let i = 0; i < armoredKey.length; i += PGP_KEY_CHUNK_SIZE) {
      chunks.push(armoredKey.slice(i, i + PGP_KEY_CHUNK_SIZE));
    }
    await SecureStore.setItemAsync(
      SECURE_STORE_KEYS.MAIL_VAULT_PGP_KEY_COUNT,
      String(chunks.length),
    );
    await Promise.all(
      chunks.map((chunk, i) =>
        SecureStore.setItemAsync(`${SECURE_STORE_KEYS.MAIL_VAULT_PGP_KEY_PART}${i}`, chunk),
      ),
    );
    log.debug(
      "[mail-password-cache] saveCachedPrivateKey: saved %d chunk(s) to SecureStore",
      chunks.length,
    );
  } catch (err) {
    log.warn(
      "[mail-password-cache] saveCachedPrivateKey: failed to persist:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Loads the cached unprotected armored PGP private key.
 * Returns `null` if not cached or if any chunk is missing / corrupted.
 */
export async function loadCachedPrivateKey(): Promise<string | null> {
  try {
    const countStr = await SecureStore.getItemAsync(
      SECURE_STORE_KEYS.MAIL_VAULT_PGP_KEY_COUNT,
    );
    if (!countStr) return null;
    const count = parseInt(countStr, 10);
    if (isNaN(count) || count <= 0) return null;

    const chunks = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        SecureStore.getItemAsync(`${SECURE_STORE_KEYS.MAIL_VAULT_PGP_KEY_PART}${i}`),
      ),
    );

    if (chunks.some((c) => c === null)) {
      log.warn("[mail-password-cache] loadCachedPrivateKey: incomplete cache, ignoring");
      return null;
    }

    log.debug(
      "[mail-password-cache] loadCachedPrivateKey: loaded %d chunk(s) from SecureStore",
      count,
    );
    return (chunks as string[]).join("");
  } catch (err) {
    log.warn(
      "[mail-password-cache] loadCachedPrivateKey: failed to read:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/**
 * Clears the cached PGP private key. Called on sign-out.
 */
export async function clearCachedPrivateKey(): Promise<void> {
  try {
    const countStr = await SecureStore.getItemAsync(
      SECURE_STORE_KEYS.MAIL_VAULT_PGP_KEY_COUNT,
    );
    if (countStr) {
      const count = parseInt(countStr, 10);
      if (!isNaN(count) && count > 0) {
        await Promise.all(
          Array.from({ length: count }, (_, i) =>
            SecureStore.deleteItemAsync(
              `${SECURE_STORE_KEYS.MAIL_VAULT_PGP_KEY_PART}${i}`,
            ).catch(() => {}),
          ),
        );
      }
      await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.MAIL_VAULT_PGP_KEY_COUNT);
    }
    log.debug("[mail-password-cache] clearCachedPrivateKey: cleared");
  } catch (err) {
    log.warn(
      "[mail-password-cache] clearCachedPrivateKey: failed:",
      err instanceof Error ? err.message : String(err),
    );
  }
}
