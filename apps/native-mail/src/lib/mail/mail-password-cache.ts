/** Caches the unlocked PGP key in expo-secure-store and removes secrets that older versions stored there. */
import * as SecureStore from "expo-secure-store";
import { createLogger } from "@workspace/logger";
import { SECURE_STORE_KEYS } from "@workspace/native-core/lib/constants";

const log = createLogger("native:mail-password-cache");

/** Removes the login password older versions stored; called at session start and on sign-out. */
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

/** Removes the derived vault key older versions stored; called at session start and on sign-out. */
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

/** Caches the unprotected armored PGP key in 1 800-char chunks to fit SecureStore's ~2 KB item limit. */
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

/** Loads the cached armored PGP key, or `null` when a chunk is missing or corrupt. */
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

/** Clears the cached PGP private key; called on sign-out. */
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
