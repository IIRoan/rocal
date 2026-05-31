/**
 * Native mail crypto orchestrator.
 *
 * This module handles the full lifecycle of the mail vault on native:
 *
 *   1. Fetch the encrypted vault backup from the backend.
 *   2. Fetch server-side key material from `vaultKeyMaterialEndpoint`.
 *   3. Try key-material first, fall back to the user's login password.
 *   4. Unlock the vault using pure-JS argon2id (no WASM — see native-vault-crypto.ts).
 *   5. Decrypt PGP-encrypted mail messages in-process using openpgp.js.
 *   6. For PGP/MIME messages, parse the decrypted MIME body with postal-mime.
 *
 * The web app performs the same steps in a Web Worker; we replicate the logic
 * here so the native app never opens a webview for crypto operations.
 *
 * Debug log prefix: [mail-crypto]
 */
import * as openpgp from "openpgp";
import PostalMime from "postal-mime";
import { createLogger } from "@workspace/logger";
import { mailFetch } from "./mail-api";
import { API_BASE_URL } from "../constants";
import { unlockEncryptedMailVaultWithDerivedKey, type UserKeyVault } from "./native-vault-crypto";
import { loadDerivedVaultKey, saveDerivedVaultKey } from "./mail-password-cache";
import { extractPgpMimeCiphertextBlobId } from "./message-security";
import type { JmapBodyStructure, MailVaultKdfParams } from "./types";
import type { MailRuntime } from "./mail-runtime";

const log = createLogger("mail-crypto");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MailDecryptResult = {
  plaintext: string;
  /** HTML body, present after PGP/MIME decryption + MIME parse. */
  html?: string | null;
  signatureVerificationState: MailSignatureVerificationState;
  hasVerifiedSignature: boolean;
};

export type MailSignatureVerificationState =
  | "not_signed"
  | "unverified"
  | "verified"
  | "failed";

type VaultBackupRecord = {
  email: string;
  vaultVersion: number;
  encryptedVaultB64: string;
  kdf: string;
  kdfParams: MailVaultKdfParams;
};

type UnlockedVault = {
  vault: UserKeyVault;
  /** The passphrase that successfully unlocked this vault (key-material or password). */
  passphrase: string;
  /** The decrypted PGP private key, ready for message decryption. */
  privateKey: openpgp.PrivateKey;
};



let cachedVault: UnlockedVault | null = null;
let vaultLoadingPromise: Promise<UnlockedVault> | null = null;

/**
 * Clears the in-memory vault cache.
 * Call this on sign-out or when the vault needs to be re-loaded.
 */
export function clearVaultCache(): void {
  log.debug("[mail-crypto] clearVaultCache: clearing in-memory vault cache");
  cachedVault = null;
  vaultLoadingPromise = null;
}

// ---------------------------------------------------------------------------
// Backend API helpers (native auth headers via mailFetch)
// ---------------------------------------------------------------------------

async function fetchVaultBackup(): Promise<VaultBackupRecord> {
  const url = `${API_BASE_URL.replace(/\/+$/, "")}/api/mail/account/vault-backup`;
  log.debug("[mail-crypto] fetchVaultBackup: GET %s", url);

  const response = await mailFetch(url, { method: "GET" });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    log.debug("[mail-crypto] fetchVaultBackup: HTTP %d — %s", response.status, body);
    throw new Error(
      `Failed to fetch mail vault backup (HTTP ${response.status}): ${body}`,
    );
  }

  const record = (await response.json()) as VaultBackupRecord;
  log.debug("[mail-crypto] fetchVaultBackup: received backup for email=%s kdf=%s", record.email, record.kdf);
  return record;
}

type KeyMaterialResult = {
  keyMaterial: string;
  /** Pre-computed argon2id output from the backend (32 bytes, base64url).
   *  Present when the backend's vault key material endpoint supports the
   *  native-optimised response. Null if no vault backup exists yet or the
   *  endpoint is an older version. */
  derivedKeyB64: string | null;
};

async function fetchKeyMaterial(endpoint: string): Promise<KeyMaterialResult> {
  log.debug("[mail-crypto] fetchKeyMaterial: GET %s", endpoint);

  const response = await mailFetch(endpoint, { method: "GET" });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    log.debug("[mail-crypto] fetchKeyMaterial: HTTP %d — %s", response.status, body);
    throw new Error(
      `Failed to fetch vault key material (HTTP ${response.status}): ${body}`,
    );
  }

  const data = (await response.json()) as {
    keyMaterial: string;
    derivedKeyB64?: string | null;
    version: string;
  };
  log.debug(
    "[mail-crypto] fetchKeyMaterial: received keyMaterial (length=%d version=%s hasDerivedKey=%s)",
    data.keyMaterial?.length ?? 0,
    data.version,
    data.derivedKeyB64 ? "yes" : "no",
  );
  return {
    keyMaterial: data.keyMaterial,
    derivedKeyB64: data.derivedKeyB64 ?? null,
  };
}

// ---------------------------------------------------------------------------
// Vault unlock helpers
// ---------------------------------------------------------------------------

/**
 * Decrypts the PGP private key stored inside the vault.
 *
 * The private key is itself protected by keyMaterial (the HMAC-derived key
 * from the server — NOT the argon2id derived key used for AES-GCM).
 */
async function decryptVaultPrivateKey(
  vault: UserKeyVault,
  passphrase: string,
): Promise<openpgp.PrivateKey> {
  log.debug("[mail-crypto] decryptVaultPrivateKey: reading private key (fingerprint=%s)",
    vault.publicKeyFingerprint);

  let privateKey: openpgp.PrivateKey;
  try {
    privateKey = await openpgp.readPrivateKey({
      armoredKey: vault.encryptedPrivateKeyArmored,
    });
  } catch (err) {
    throw new Error(
      `Failed to parse PGP private key from vault: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!privateKey.isDecrypted()) {
    log.debug("[mail-crypto] decryptVaultPrivateKey: private key is encrypted, decrypting...");
    try {
      privateKey = await openpgp.decryptKey({ privateKey, passphrase });
    } catch (err) {
      throw new Error(
        `Failed to decrypt PGP private key: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else {
    log.debug("[mail-crypto] decryptVaultPrivateKey: private key is already decrypted (no passphrase needed)");
  }

  log.debug("[mail-crypto] decryptVaultPrivateKey: private key ready");
  return privateKey;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ensures the mail vault is loaded and the PGP private key is ready for
 * decryption. Results are cached in memory for the app session.
 *
 * Resolution order for the passphrase:
 *   1. Server-provided key material (`vaultKeyMaterialEndpoint`)
 *   2. The `fallbackPassword` argument (caller-supplied, e.g. from in-memory ref)
 *   3. Password persisted in expo-secure-store (survives app restarts)
 *
 * Throws if none of the candidates can unlock the vault.
 */
export async function ensureVaultLoaded(
  runtime: MailRuntime,
  fallbackPassword?: string | null,
): Promise<UnlockedVault> {
  if (cachedVault) {
    log.debug("[mail-crypto] ensureVaultLoaded: vault already loaded, returning cached");
    return cachedVault;
  }

  if (vaultLoadingPromise) {
    log.debug("[mail-crypto] ensureVaultLoaded: vault loading in progress, awaiting...");
    return vaultLoadingPromise;
  }

  vaultLoadingPromise = doLoadVault(runtime, fallbackPassword);

  try {
    cachedVault = await vaultLoadingPromise;
    log.debug("[mail-crypto] ensureVaultLoaded: vault loaded and cached successfully");
    return cachedVault;
  } catch (err) {
    console.error(
      "[mail-crypto] ensureVaultLoaded: vault unlock FAILED:",
      err instanceof Error ? err.message : String(err),
    );
    vaultLoadingPromise = null;
    throw err;
  }
}

async function doLoadVault(
  runtime: MailRuntime,
  fallbackPassword?: string | null,
): Promise<UnlockedVault> {
  log.debug("[mail-crypto] doLoadVault: starting vault load, backendBaseUrl=%s", API_BASE_URL);

  // Step 1: Fetch vault backup from backend
  log.debug("[mail-crypto] doLoadVault: step 1 — fetching vault backup");
  let backup: VaultBackupRecord;
  try {
    backup = await fetchVaultBackup();
  } catch (err) {
    throw new Error(
      `Could not load vault backup: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (backup.kdf !== "argon2id") {
    log.warn("[mail-crypto] doLoadVault: unexpected KDF: %s (expected argon2id)", backup.kdf);
  }

  log.debug("[mail-crypto] doLoadVault: kdfParams memoryKiB=%d iterations=%d parallelism=%d",
    backup.kdfParams.memoryKiB, backup.kdfParams.iterations, backup.kdfParams.parallelism);

  // Step 2: Always fetch key material from server.
  //   - `keyMaterial` is used as the OpenPGP private key passphrase (always needed).
  //   - `derivedKeyB64` (if present) is the argon2id output pre-computed server-side
  //     so Hermes never has to run argon2id locally.
  log.debug("[mail-crypto] doLoadVault: step 2 — fetching key material from server");
  const keyMaterialEndpoint = runtime.config.vaultKeyMaterialEndpoint;
  let keyMaterial: string | null = null;
  let derivedKeyB64: string | null = null;

  if (keyMaterialEndpoint) {
    log.debug("[mail-crypto] doLoadVault: fetching key material from %s", keyMaterialEndpoint);
    try {
      const result = await fetchKeyMaterial(keyMaterialEndpoint);
      keyMaterial = result.keyMaterial;
      derivedKeyB64 = result.derivedKeyB64;
      log.debug(
        "[mail-crypto] doLoadVault: key material received (length=%d hasDerivedKey=%s)",
        keyMaterial?.length ?? 0,
        derivedKeyB64 ? "YES" : "NO",
      );
    } catch (err) {
      log.warn(
        "[mail-crypto] doLoadVault: could not fetch key material: %s",
        err instanceof Error ? err.message : String(err),
      );
    }
  } else {
    log.debug("[mail-crypto] doLoadVault: no vaultKeyMaterialEndpoint configured, skipping key-material");
  }

  // Step 3a: Fast path — derived key from server or SecureStore cache.
  //
  // `derivedKeyB64` is the argon2id(keyMaterial, salt, kdfParams) output,
  // computed by the backend with WASM. We use it as the AES-GCM key to decrypt
  // the vault envelope, but we ALWAYS use `keyMaterial` as the OpenPGP private
  // key passphrase (the PGP key was sealed with keyMaterial, not the derived key).
  log.debug("[mail-crypto] doLoadVault: step 3 — trying derived-key fast path (no argon2id)");

  // If the server didn't return a derived key, check the SecureStore cache.
  if (!derivedKeyB64) {
    const cachedDerivedKey = await loadDerivedVaultKey();
    if (cachedDerivedKey) {
      log.debug("[mail-crypto] doLoadVault: no server derived key — using SecureStore cached key");
      derivedKeyB64 = cachedDerivedKey;
    } else {
      log.debug("[mail-crypto] doLoadVault: no derived key in SecureStore either");
    }
  }

  if (derivedKeyB64) {
    log.debug("[mail-crypto] doLoadVault: attempting vault decrypt with derived key");
    let unlockedVault: UserKeyVault | null = null;
    try {
      unlockedVault = await unlockEncryptedMailVaultWithDerivedKey(
        backup.encryptedVaultB64,
        derivedKeyB64,
      );
      log.debug("[mail-crypto] doLoadVault: derived key vault decrypt SUCCEEDED — saving to cache");
      await saveDerivedVaultKey(derivedKeyB64);
    } catch (err) {
      log.warn(
        "[mail-crypto] doLoadVault: derived key vault decrypt FAILED (key may be stale): %s",
        err instanceof Error ? err.message : String(err),
      );
    }

    if (unlockedVault) {
      // keyMaterial is the passphrase for the PGP private key inside the vault.
      // It MUST be available — if the key-material endpoint was unreachable,
      // we cannot finish decryption even though the vault itself was unlocked.
      if (!keyMaterial) {
        throw new Error(
          "keyMaterial unavailable — vault was decrypted but PGP private key passphrase could not be fetched. " +
          "Check your network connection and try again.",
        );
      }

      log.debug("[mail-crypto] doLoadVault: decrypting PGP private key with keyMaterial");
      const privateKey = await decryptVaultPrivateKey(unlockedVault, keyMaterial);
      log.debug("[mail-crypto] doLoadVault: SUCCESS via derived-key fast path");
      return { vault: unlockedVault, passphrase: keyMaterial, privateKey };
    }
    // Vault decrypt failed — fall through to the abort below
  }

  // Step 3b: Argon2id fallback — only reached if:
  //  (a) backend did not return derivedKeyB64, AND
  //  (b) no cached derived key in SecureStore
  //
  // WARNING: argon2id is synchronous and WILL block the Hermes JS thread.
  // With memoryKiB=65536, this causes the engine to crash (OOM), which
  // restarts the component and loops forever. We ABORT instead of running it
  // to prevent the crash loop, and show a clear error to the user.
  log.error(
    "[mail-crypto] doLoadVault: ABORTING — no derived key available and argon2id would crash Hermes " +
    "(memoryKiB=%d). Backend must return derivedKeyB64. Check backend logs.",
    backup.kdfParams.memoryKiB,
  );
  throw new Error(
    "Mail vault could not be unlocked: the backend did not provide a pre-computed decryption key. " +
    "This may be a temporary server issue — please try again in a moment, or sign out and sign back in.",
  );
}

/**
 * Decrypts a PGP-armored mail message body using the vault's private key.
 *
 * The vault is loaded (and cached) on first use. If the vault cannot be
 * unlocked with any available passphrase this throws — callers should catch
 * and display an appropriate "re-authenticate" prompt.
 *
 * @param runtime     The active MailRuntime (provides config + auth token).
 * @param messageId   For logging/correlation only.
 * @param armoredMessage  Armored PGP message (inline or MIME).
 * @param senderPublicKeyArmored  Optional sender public key for signature verification.
 */
export async function decryptMailMessage(
  runtime: MailRuntime,
  messageId: string,
  armoredMessage: string,
  senderPublicKeyArmored?: string,
): Promise<MailDecryptResult> {
  log.debug("[mail-crypto] decryptMailMessage: start id=%s armoredLength=%d", messageId, armoredMessage.length);
  const result = await decryptArmoredMessage(runtime, messageId, armoredMessage, senderPublicKeyArmored);
  log.debug(
    "[mail-crypto] decryptMailMessage: SUCCESS id=%s plaintext=%db sigState=%s",
    messageId,
    result.plaintext.length,
    result.signatureVerificationState,
  );
  return result;
}

/**
 * Decrypts a PGP/MIME message (RFC 3156).
 *
 * PGP/MIME structure:
 *   multipart/encrypted
 *     subParts[0]: application/pgp-encrypted  (version notice, ignored)
 *     subParts[1]: application/octet-stream   (the armored PGP ciphertext blob)
 *
 * Steps:
 *   1. Extract the ciphertext blobId from bodyStructure.subParts[1].
 *   2. Fetch the armored ciphertext via JMAP download URL.
 *   3. Decrypt with openpgp using the vault private key.
 *   4. Parse the decrypted MIME payload with postal-mime.
 *   5. Return both text and HTML from the parsed MIME.
 */
export async function decryptPgpMimeMessage(
  runtime: MailRuntime,
  messageId: string,
  bodyStructure: JmapBodyStructure | undefined,
  senderPublicKeyArmored?: string,
): Promise<MailDecryptResult> {
  log.debug("[mail-crypto] decryptPgpMimeMessage: start id=%s", messageId);

  // Step 1: locate the ciphertext blob
  const blobId = extractPgpMimeCiphertextBlobId(bodyStructure);
  if (!blobId) {
    throw new Error(
      `[mail-crypto] id=${messageId}: Could not locate PGP/MIME ciphertext blob in bodyStructure`,
    );
  }
  log.debug("[mail-crypto] decryptPgpMimeMessage: blobId=%s id=%s", blobId, messageId);

  // Step 2: fetch armored ciphertext from JMAP
  let armoredMessage: string;
  try {
    armoredMessage = await runtime.client.getBlobAsText(runtime.session, blobId);
    log.debug(
      "[mail-crypto] decryptPgpMimeMessage: fetched blob length=%d id=%s",
      armoredMessage.length,
      messageId,
    );
  } catch (err) {
    throw new Error(
      `[mail-crypto] id=${messageId}: Failed to fetch PGP/MIME ciphertext blob: ` +
        (err instanceof Error ? err.message : String(err)),
    );
  }

  // Steps 3–4: decrypt PGP + check signatures (shared with inline path)
  const pgpResult = await decryptArmoredMessage(runtime, messageId, armoredMessage, senderPublicKeyArmored);

  // Step 5: parse decrypted MIME body with postal-mime
  log.debug(
    "[mail-crypto] decryptPgpMimeMessage: parsing MIME body length=%d id=%s",
    pgpResult.plaintext.length,
    messageId,
  );
  let parsedText: string | null = null;
  let parsedHtml: string | null = null;
  try {
    const parsed = await PostalMime.parse(pgpResult.plaintext);
    parsedText = parsed.text ?? null;
    parsedHtml = parsed.html ?? null;
    log.debug(
      "[mail-crypto] decryptPgpMimeMessage: MIME parsed text=%s html=%s id=%s",
      parsedText != null ? `${parsedText.length}b` : "null",
      parsedHtml != null ? `${parsedHtml.length}b` : "null",
      messageId,
    );
  } catch (err) {
    log.warn(
      "[mail-crypto] decryptPgpMimeMessage: MIME parse failed, using raw plaintext id=%s: %s",
      messageId,
      err instanceof Error ? err.message : String(err),
    );
    // Fall back to raw decrypted text
    parsedText = pgpResult.plaintext;
  }

  return {
    plaintext: parsedText ?? pgpResult.plaintext,
    html: parsedHtml,
    signatureVerificationState: pgpResult.signatureVerificationState,
    hasVerifiedSignature: pgpResult.hasVerifiedSignature,
  };
}

// ---------------------------------------------------------------------------
// Shared PGP decrypt core
// ---------------------------------------------------------------------------

/**
 * Decrypts an armored PGP message using the cached vault private key.
 * Returns raw plaintext (no MIME parsing). Used by both inline PGP and
 * PGP/MIME paths.
 */
async function decryptArmoredMessage(
  runtime: MailRuntime,
  messageId: string,
  armoredMessage: string,
  senderPublicKeyArmored?: string,
): Promise<MailDecryptResult> {
  let unlockedVault: UnlockedVault;
  try {
    unlockedVault = await ensureVaultLoaded(runtime);
  } catch (err) {
    console.error(
      `[mail-crypto] decryptArmoredMessage: ensureVaultLoaded FAILED for id=${messageId}:`,
      err instanceof Error ? err.message : String(err),
    );
    throw err;
  }

  let message: openpgp.Message<string>;
  try {
    message = await openpgp.readMessage({ armoredMessage });
  } catch (err) {
    throw new Error(
      `[mail-crypto] id=${messageId}: Failed to parse PGP message: ` +
        (err instanceof Error ? err.message : String(err)),
    );
  }

  let verificationKeys: openpgp.Key | undefined;
  if (senderPublicKeyArmored) {
    try {
      verificationKeys = await openpgp.readKey({ armoredKey: senderPublicKeyArmored });
    } catch (err) {
      log.warn(
        "[mail-crypto] decryptArmoredMessage: could not parse sender public key id=%s: %s",
        messageId,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  let decrypted: openpgp.DecryptMessageResult;
  try {
    decrypted = await openpgp.decrypt({
      message,
      decryptionKeys: unlockedVault.privateKey,
      verificationKeys,
    });
  } catch (err) {
    throw new Error(
      `[mail-crypto] id=${messageId}: PGP decryption failed: ` +
        (err instanceof Error ? err.message : String(err)),
    );
  }

  let signatureVerificationState: MailSignatureVerificationState = "not_signed";
  if (Array.isArray(decrypted.signatures) && decrypted.signatures.length > 0) {
    if (!verificationKeys) {
      signatureVerificationState = "unverified";
    } else {
      try {
        await Promise.all(decrypted.signatures.map((sig) => sig.verified));
        signatureVerificationState = "verified";
      } catch {
        signatureVerificationState = "failed";
      }
    }
  }

  const plaintext =
    typeof decrypted.data === "string"
      ? decrypted.data
      : new TextDecoder().decode(decrypted.data as Uint8Array);

  return {
    plaintext,
    signatureVerificationState,
    hasVerifiedSignature: signatureVerificationState === "verified",
  };
}

/**
 * Returns `true` if the vault is currently loaded in memory.
 * Useful for UI indicators (e.g., showing a lock icon when vault is locked).
 */
export function isVaultLoaded(): boolean {
  return cachedVault !== null;
}

/**
 * Returns the fingerprint of the loaded vault's public key, or `null` if
 * the vault is not loaded.
 */
export function getLoadedVaultFingerprint(): string | null {
  return cachedVault?.vault.publicKeyFingerprint ?? null;
}
