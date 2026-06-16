/**
 * Native mail crypto orchestrator.
 *
 * This module handles the full lifecycle of the mail vault on native:
 *
 *   1. Fetch the encrypted vault backup from the backend.
 *   2. Fetch server-side key material from `vaultKeyMaterialEndpoint`.
 *   3. Try server key-material first, then fall back to saved passwords when
 *      the vault KDF is safe enough to run on Hermes.
 *   4. Migrate older password-based vaults to server key-material in the
 *      background when native unlock succeeds.
 *   5. Decrypt PGP-encrypted mail messages in-process using openpgp.js.
 *   6. For PGP/MIME messages, parse the decrypted MIME body with postal-mime.
 *
 * The web app performs the same steps in a Web Worker; we replicate the logic
 * here so the native app never opens a webview for crypto operations.
 *
 * Debug log prefix: [mail-crypto]
 */
import * as openpgp from "openpgp";
import { createLogger } from "@workspace/logger";
import { mailFetch, upsertAccountVaultBackup } from "./mail-api";
import { API_BASE_URL } from "../constants";
import {
  createEncryptedMailVault,
  unlockEncryptedMailVault,
  unlockEncryptedMailVaultWithDerivedKey,
  type UserKeyVault,
} from "./native-vault-crypto";
import {
  loadMailVaultPassword,
  loadDerivedVaultKey,
  saveDerivedVaultKey,
  loadCachedPrivateKey,
  saveCachedPrivateKey,
} from "./mail-password-cache";
import { extractPgpMimeCiphertextBlobId } from "./message-security";
import {
  containsArmoredPgpMessage,
  MAX_PGP_DECRYPT_LAYERS,
  mergeSignatureVerificationState,
  resolveLayerSignatureVerificationState,
} from "./pgp-layers";
import { parseMimeBody } from "./mail-mime-parser";
import type {
  JmapAttachment,
  JmapBodyStructure,
  LabelDef,
  MailVaultKdfParams,
} from "./types";
import type { MailRuntime } from "./mail-runtime";

const log = createLogger("mail-crypto");
const KEY_MATERIAL_KDF: Partial<MailVaultKdfParams> = {
  memoryKiB: 8192,
  iterations: 1,
  parallelism: 1,
};
const MAX_SAFE_NATIVE_ARGON2_MEMORY_KIB = 8192;
const MAX_SAFE_NATIVE_ARGON2_ITERATIONS = 1;
const MAX_SAFE_NATIVE_ARGON2_PARALLELISM = 1;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MailDecryptResult = {
  plaintext: string;
  /** HTML body, present after PGP/MIME decryption + MIME parse. */
  html?: string | null;
  /** Attachments extracted from decrypted PGP/MIME payload. */
  attachments?: JmapAttachment[];
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

async function streamToString(stream: unknown): Promise<string> {
  if (typeof stream === "string") {
    return stream;
  }

  return new Response(stream as BodyInit).text();
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

function canAttemptLocalVaultUnlock(kdfParams: MailVaultKdfParams): boolean {
  return (
    kdfParams.memoryKiB <= MAX_SAFE_NATIVE_ARGON2_MEMORY_KIB &&
    kdfParams.iterations <= MAX_SAFE_NATIVE_ARGON2_ITERATIONS &&
    kdfParams.parallelism <= MAX_SAFE_NATIVE_ARGON2_PARALLELISM
  );
}

function getPassphraseCandidates(input: {
  keyMaterial?: string | null;
  fallbackPassword?: string | null;
  storedPassword?: string | null;
}): string[] {
  return Array.from(
    new Set(
      [input.keyMaterial, input.fallbackPassword, input.storedPassword].filter(
        (value): value is string => Boolean(value),
      ),
    ),
  );
}

async function migrateVaultToKeyMaterial(input: {
  unlockedVault: UserKeyVault;
  oldPassphrase: string;
  newPassphrase: string;
  vaultVersion: number;
}): Promise<void> {
  try {
    const decryptedPrivateKey = await openpgp.decryptKey({
      privateKey: await openpgp.readPrivateKey({
        armoredKey: input.unlockedVault.encryptedPrivateKeyArmored,
      }),
      passphrase: input.oldPassphrase,
    });
    const reEncrypted = await openpgp.encryptKey({
      privateKey: decryptedPrivateKey,
      passphrase: input.newPassphrase,
    });
    const migratedVault: UserKeyVault = {
      ...input.unlockedVault,
      encryptedPrivateKeyArmored: reEncrypted.armor(),
    };
    const encrypted = await createEncryptedMailVault(
      migratedVault,
      input.newPassphrase,
      KEY_MATERIAL_KDF,
    );

    await upsertAccountVaultBackup({
      vaultVersion: input.vaultVersion,
      encryptedVaultB64: encrypted.encryptedVaultB64,
      kdf: encrypted.kdf,
      kdfParams: encrypted.kdfParams,
    });
  } catch (error) {
    log.warn("Background vault migration to key material failed", { error });
  }
}

// ---------------------------------------------------------------------------
// Vault unlock helpers
// ---------------------------------------------------------------------------

/**
 * Decrypts the PGP private key stored inside the vault.
 *
 * The private key is itself protected by keyMaterial (the HMAC-derived key
 * from the server — NOT the argon2id derived key used for AES-GCM).
 *
 * After a successful S2K decryption the unprotected armored key is written to
 * SecureStore so subsequent app sessions can bypass the expensive (~14 s on
 * Hermes) S2K derivation entirely.
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
    // Cache the unprotected key so we skip S2K on the next app session.
    saveCachedPrivateKey(privateKey.armor()).catch(() => {});
  } else {
    log.debug("[mail-crypto] decryptVaultPrivateKey: private key is already decrypted (no passphrase needed)");
  }

  log.debug("[mail-crypto] decryptVaultPrivateKey: private key ready");
  return privateKey;
}

async function loadCachedPrivateKeyForVault(
  vault: UserKeyVault,
): Promise<openpgp.PrivateKey | null> {
  const cachedArmored = await loadCachedPrivateKey();
  if (!cachedArmored) {
    return null;
  }

  try {
    const candidate = await openpgp.readPrivateKey({ armoredKey: cachedArmored });
    if (
      candidate.isDecrypted() &&
      candidate.getFingerprint().toUpperCase() ===
        vault.publicKeyFingerprint.toUpperCase()
    ) {
      log.debug(
        "[mail-crypto] loadCachedPrivateKeyForVault: using cached decrypted private key",
      );
      return candidate;
    }

    log.debug(
      "[mail-crypto] loadCachedPrivateKeyForVault: cached key fingerprint mismatch or not decrypted",
    );
    return null;
  } catch (error) {
    log.warn(
      "[mail-crypto] loadCachedPrivateKeyForVault: cached key unreadable: %s",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
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
  log.debug(
    "[mail-crypto] doLoadVault: starting vault load, backendBaseUrl=%s",
    API_BASE_URL,
  );

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
    log.warn(
      "[mail-crypto] doLoadVault: unexpected KDF: %s (expected argon2id)",
      backup.kdf,
    );
  }

  log.debug(
    "[mail-crypto] doLoadVault: kdfParams memoryKiB=%d iterations=%d parallelism=%d",
    backup.kdfParams.memoryKiB,
    backup.kdfParams.iterations,
    backup.kdfParams.parallelism,
  );

  log.debug("[mail-crypto] doLoadVault: step 2 — fetching key material from server");
  const keyMaterialEndpoint = runtime.config.vaultKeyMaterialEndpoint;
  let keyMaterial: string | null = null;
  let derivedKeyB64: string | null = null;

  if (keyMaterialEndpoint) {
    log.debug(
      "[mail-crypto] doLoadVault: fetching key material from %s",
      keyMaterialEndpoint,
    );
    try {
      const result = await fetchKeyMaterial(keyMaterialEndpoint);
      keyMaterial = result.keyMaterial;
      derivedKeyB64 = result.derivedKeyB64 ?? null;
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
    log.debug(
      "[mail-crypto] doLoadVault: no vaultKeyMaterialEndpoint configured, skipping key-material",
    );
  }

  log.debug("[mail-crypto] doLoadVault: step 3 — trying derived-key fast path");
  if (!derivedKeyB64) {
    const cachedDerivedKey = await loadDerivedVaultKey();
    if (cachedDerivedKey) {
      log.debug(
        "[mail-crypto] doLoadVault: no server derived key — using SecureStore cached key",
      );
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
      log.debug(
        "[mail-crypto] doLoadVault: derived key vault decrypt SUCCEEDED — saving to cache",
      );
      await saveDerivedVaultKey(derivedKeyB64);
    } catch (err) {
      log.warn(
        "[mail-crypto] doLoadVault: derived key vault decrypt FAILED (key may be stale): %s",
        err instanceof Error ? err.message : String(err),
      );
    }

    if (unlockedVault) {
      const cachedPrivateKey =
        await loadCachedPrivateKeyForVault(unlockedVault);
      if (cachedPrivateKey) {
        log.debug(
          "[mail-crypto] doLoadVault: SUCCESS via derived-key fast path with cached private key",
        );
        return {
          vault: unlockedVault,
          passphrase: keyMaterial ?? "",
          privateKey: cachedPrivateKey,
        };
      }

      if (!keyMaterial) {
        throw new Error(
          "keyMaterial unavailable — vault was decrypted but the PGP private-key passphrase could not be fetched. Check your network connection and try again.",
        );
      }

      const privateKey = await decryptVaultPrivateKey(unlockedVault, keyMaterial);

      log.debug("[mail-crypto] doLoadVault: SUCCESS via derived-key fast path");
      return { vault: unlockedVault, passphrase: keyMaterial, privateKey };
    }
  }

  const storedPassword = await loadMailVaultPassword();
  const passphraseCandidates = getPassphraseCandidates({
    keyMaterial,
    fallbackPassword,
    storedPassword,
  });

  if (passphraseCandidates.length === 0) {
    throw new Error(
      "Mail vault could not be unlocked because no server key material or saved sign-in password is available on this device.",
    );
  }

  if (!canAttemptLocalVaultUnlock(backup.kdfParams)) {
    log.error(
      "[mail-crypto] doLoadVault: ABORTING — local argon2id migration is too expensive for Hermes (memoryKiB=%d iterations=%d parallelism=%d)",
      backup.kdfParams.memoryKiB,
      backup.kdfParams.iterations,
      backup.kdfParams.parallelism,
    );
    throw new Error(
      "Mail vault could not be unlocked on this device because it still needs a high-cost password migration. Open secure web mail once to migrate the vault, then try again here.",
    );
  }

  log.debug(
    "[mail-crypto] doLoadVault: step 3b — trying local passphrase candidates",
  );

  for (const passphrase of passphraseCandidates) {
    try {
      const unlockedVault = await unlockEncryptedMailVault(
        backup.encryptedVaultB64,
        passphrase,
        backup.kdfParams,
      );
      const privateKey =
        (await loadCachedPrivateKeyForVault(unlockedVault)) ??
        (await decryptVaultPrivateKey(unlockedVault, passphrase));

      if (keyMaterial && passphrase !== keyMaterial) {
        void migrateVaultToKeyMaterial({
          unlockedVault,
          oldPassphrase: passphrase,
          newPassphrase: keyMaterial,
          vaultVersion: backup.vaultVersion,
        });
      }

      log.debug(
        "[mail-crypto] doLoadVault: SUCCESS via local passphrase candidate",
      );
      return { vault: unlockedVault, passphrase, privateKey };
    } catch (err) {
      log.warn(
        "[mail-crypto] doLoadVault: local passphrase candidate failed: %s",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  throw new Error(
    "Mail vault could not be unlocked with the available server key material or saved passwords. Sign out and sign back in with your email password once, or open secure web mail to finish migration.",
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
 * Encrypts a plaintext body for one or more recipient public keys.
 * The sender's own public key is always included by callers so sent mail
 * remains readable on this device.
 */
export async function encryptForRecipients(input: {
  plaintext: string;
  recipientPublicKeysArmored: string[];
}): Promise<{ armoredMessage: string }> {
  if (!cachedVault) {
    throw new Error("Mail vault is not loaded on this device.");
  }

  const encryptionKeys = await Promise.all(
    input.recipientPublicKeysArmored.map((armoredKey) =>
      openpgp.readKey({ armoredKey }),
    ),
  );
  const encrypted = await openpgp.encrypt({
    message: await openpgp.createMessage({ text: input.plaintext }),
    encryptionKeys,
    signingKeys: cachedVault.privateKey,
    format: "armored",
  });
  const armoredMessage =
    typeof encrypted === "string" ? encrypted : await streamToString(encrypted);

  return { armoredMessage };
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

  // Step 5: parse decrypted MIME body with the native MIME parser
  log.debug(
    "[mail-crypto] decryptPgpMimeMessage: parsing MIME body length=%d id=%s",
    pgpResult.plaintext.length,
    messageId,
  );
  let parsedText: string | null = null;
  let parsedHtml: string | null = null;
  let parsedAttachments: JmapAttachment[] = [];
  try {
    const parsed = parseMimeBody(pgpResult.plaintext);
    parsedText = parsed.text;
    parsedHtml = parsed.html;
    parsedAttachments = parsed.attachments;
    log.debug(
      "[mail-crypto] decryptPgpMimeMessage: MIME parsed text=%s html=%s attachments=%d id=%s",
      parsedText != null ? `${parsedText.length}b` : "null",
      parsedHtml != null ? `${parsedHtml.length}b` : "null",
      parsed.attachments?.length ?? 0,
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
    attachments: parsedAttachments,
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

  let currentArmored = armoredMessage.trim();
  let plaintext = "";
  let signatureVerificationState: MailSignatureVerificationState = "not_signed";

  for (let layer = 0; layer < MAX_PGP_DECRYPT_LAYERS; layer++) {
    if (!containsArmoredPgpMessage(currentArmored)) {
      plaintext = currentArmored;
      break;
    }

    let message: openpgp.Message<string>;
    try {
      message = await openpgp.readMessage({ armoredMessage: currentArmored });
    } catch (err) {
      throw new Error(
        `[mail-crypto] id=${messageId}: Failed to parse PGP message: ` +
          (err instanceof Error ? err.message : String(err)),
      );
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

    plaintext =
      typeof decrypted.data === "string"
        ? decrypted.data
        : new TextDecoder().decode(decrypted.data as Uint8Array);

    const layerSignatureState = await resolveLayerSignatureVerificationState({
      signatures: decrypted.signatures,
      hasVerificationKey: Boolean(verificationKeys),
    });
    signatureVerificationState = mergeSignatureVerificationState(
      signatureVerificationState,
      layerSignatureState,
    );

    if (!containsArmoredPgpMessage(plaintext)) {
      break;
    }

    currentArmored = plaintext.trim();
  }

  if (!plaintext) {
    throw new Error(
      `[mail-crypto] id=${messageId}: PGP decryption did not return any plaintext.`,
    );
  }

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

/** Returns label definitions from the in-memory vault, or `[]` if not loaded. */
export function getVaultLabels(): LabelDef[] {
  return cachedVault?.vault.labels ?? [];
}

/**
 * Persists updated label definitions into the encrypted vault backup so web and
 * native stay in sync.
 */
export async function saveVaultLabels(labels: LabelDef[]): Promise<void> {
  if (!cachedVault) {
    throw new Error("Mail vault is not loaded");
  }

  const updatedVault: UserKeyVault = {
    ...cachedVault.vault,
    labels,
  };

  const { kdfParams } = cachedVault.vault;
  const encrypted = await createEncryptedMailVault(
    updatedVault,
    cachedVault.passphrase,
    kdfParams
      ? {
          saltB64: kdfParams.saltB64,
          memoryKiB: kdfParams.memoryKiB,
          iterations: kdfParams.iterations,
          parallelism: kdfParams.parallelism,
        }
      : KEY_MATERIAL_KDF,
  );

  cachedVault = { ...cachedVault, vault: updatedVault };

  await upsertAccountVaultBackup({
    vaultVersion: updatedVault.vaultVersion,
    encryptedVaultB64: encrypted.encryptedVaultB64,
    kdf: encrypted.kdf,
    kdfParams: encrypted.kdfParams,
  });
}
