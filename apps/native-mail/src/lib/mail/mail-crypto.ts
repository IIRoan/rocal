/** Native mail vault lifecycle: fetch the encrypted backup, unseal its passphrase with the E2EE key, decrypt PGP mail in-process. */
import * as openpgp from "openpgp";
import { createLogger } from "@workspace/logger";
import { mailFetch, upsertAccountVaultBackup } from "./mail-api";
import { API_BASE_URL } from "@workspace/native-core/lib/constants";
import {
  createEncryptedMailVault,
  unlockEncryptedMailVault,
  unlockEncryptedMailVaultWithDerivedKey,
  type UserKeyVault,
} from "./native-vault-crypto";
import {
  loadDerivedVaultKey,
  saveDerivedVaultKey,
  loadCachedPrivateKey,
  saveCachedPrivateKey,
} from "./mail-password-cache";
import {
  generateVaultSecret,
  unwrapVaultSecret,
  VAULT_WRAP_ALGORITHM,
  wrapVaultSecret,
} from "./vault-secret";
import { extractPgpMimeCiphertextBlobId } from "./message-security";
import { parseMimeBody } from "./mail-mime-parser";
import type {
  JmapAttachment,
  JmapBodyStructure,
  LabelDef,
  MailVaultKdfParams,
} from "./types";
import { looksLikeMimeMessage, containsArmoredPgpMessage, MAX_PGP_DECRYPT_LAYERS, mergeSignatureVerificationState, resolveLayerSignatureVerificationState } from "@workspace/calendar-core";
import type { MailVaultBackup } from "@workspace/calendar-core";
import type { MailRuntime } from "./mail-runtime";

const log = createLogger("mail-crypto");
const KEY_MATERIAL_KDF: Partial<MailVaultKdfParams> = {
  memoryKiB: 8192,
  iterations: 1,
  parallelism: 1,
};

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

function isVaultBackupRecord(value: unknown): value is MailVaultBackup {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.email === "string" &&
    typeof record.vaultVersion === "number" &&
    typeof record.encryptedVaultB64 === "string" &&
    typeof record.kdf === "string" &&
    typeof record.kdfParams === "object" &&
    record.kdfParams !== null
  );
}

type UnlockedVault = {
  vault: UserKeyVault;
  /** The passphrase that successfully unlocked this vault (key-material or password). */
  passphrase: string;
  /** The decrypted PGP private key, ready for message decryption. */
  privateKey: openpgp.PrivateKey;
};



let cachedVault: UnlockedVault | null = null;
let vaultLoadingPromise: Promise<UnlockedVault> | null = null;
let unlockGate: Promise<void> | null = null;
let openUnlockGate: (() => void) | null = null;

/** Warm starts render mail before the E2EE session exists; unlocks wait for it instead of failing. */
export function holdVaultUnlock(): void {
  if (unlockGate) return;
  unlockGate = new Promise<void>((resolve) => {
    openUnlockGate = resolve;
  });
}

export function releaseVaultUnlock(): void {
  openUnlockGate?.();
  openUnlockGate = null;
  unlockGate = null;
}

/** Clears the in-memory vault cache; call on sign-out or when the vault must reload. */
export function clearVaultCache(): void {
  log.debug("[mail-crypto] clearVaultCache: clearing in-memory vault cache");
  cachedVault = null;
  vaultLoadingPromise = null;
  releaseVaultUnlock();
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

async function fetchVaultBackup(): Promise<MailVaultBackup> {
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

  const payload: unknown = await response.json();
  if (!isVaultBackupRecord(payload)) {
    throw new Error("Invalid mail vault backup response");
  }
  const record = payload;
  log.debug("[mail-crypto] fetchVaultBackup: received backup for email=%s kdf=%s", record.email, record.kdf);
  return record;
}

async function rekeyVault(input: {
  unlockedVault: UserKeyVault;
  oldPassphrase: string;
  newPassphrase: string;
  vaultVersion: number;
  wrappedSecret: string;
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
      wrappedSecret: input.wrappedSecret,
      wrapAlgorithm: VAULT_WRAP_ALGORITHM,
    });
  } catch (error) {
    log.warn("Vault re-key failed", { error });
  }
}

/** Moves a legacy vault off the server-derived passphrase onto a random secret sealed to the E2EE key. */
async function sealVaultToAccountKey(input: {
  unlockedVault: UserKeyVault;
  currentPassphrase: string;
  vaultVersion: number;
}): Promise<void> {
  try {
    const secret = generateVaultSecret();
    const wrappedSecret = await wrapVaultSecret(secret);
    if (!wrappedSecret) {
      // No E2EE session on this device yet; the next open retries.
      return;
    }

    await rekeyVault({
      unlockedVault: input.unlockedVault,
      oldPassphrase: input.currentPassphrase,
      newPassphrase: secret,
      vaultVersion: input.vaultVersion,
      wrappedSecret,
    });
  } catch (error) {
    log.warn("Sealing the mail vault to the account key failed", { error });
  }
}

// ---------------------------------------------------------------------------
// Vault unlock helpers
// ---------------------------------------------------------------------------

/** Decrypts the vault's PGP private key and caches the unprotected key so later sessions skip the ~14 s Hermes S2K. */
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
    saveCachedPrivateKey(privateKey.armor()).catch(() => { });
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

/** Loads and caches the vault for the session; the passphrase is sealed to the E2EE key, so it only works signed in. */
export async function ensureVaultLoaded(
  runtime: MailRuntime,
  fallbackPassword?: string | null,
): Promise<UnlockedVault> {
  if (cachedVault) {
    log.debug("[mail-crypto] ensureVaultLoaded: vault already loaded, returning cached");
    return cachedVault;
  }

  if (unlockGate) {
    await unlockGate;
    if (cachedVault) return cachedVault;
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
    log.error("[mail-crypto] ensureVaultLoaded: vault unlock failed");
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
  let backup: MailVaultBackup;
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

  // Preferred path: the passphrase is sealed to this user's E2EE key, so only a signed-in device can open the vault.
  if (backup.wrappedSecret) {
    const sealedSecret = await unwrapVaultSecret(backup.wrappedSecret);
    if (sealedSecret) {
      try {
        const unlockedVault = await unlockEncryptedMailVault(
          backup.encryptedVaultB64,
          sealedSecret,
          backup.kdfParams,
          (keyB64) => {
            void saveDerivedVaultKey(keyB64).catch(() => undefined);
          },
        );
        const privateKey =
          (await loadCachedPrivateKeyForVault(unlockedVault)) ??
          (await decryptVaultPrivateKey(unlockedVault, sealedSecret));

        log.debug("[mail-crypto] doLoadVault: SUCCESS via sealed vault secret");
        return { vault: unlockedVault, passphrase: sealedSecret, privateKey };
      } catch (err) {
        log.warn(
          "[mail-crypto] doLoadVault: sealed-secret unlock failed: %s",
          err instanceof Error ? err.message : String(err),
        );
        throw err;
      }
    }
  }

  throw new Error(
    "Mail vault could not be unlocked on this device. Make sure you are signed in so your encryption keys are available, then try again.",
  );
}

/** Decrypts an armored PGP mail body with the vault key; throws when no passphrase can unlock the vault. */
export async function decryptMailMessage(
  runtime: MailRuntime,
  messageId: string,
  armoredMessage: string,
  senderPublicKeyArmored?: string,
): Promise<MailDecryptResult> {
  log.debug("[mail-crypto] decryptMailMessage: start id=%s armoredLength=%d", messageId, armoredMessage.length);
  const result = await decryptArmoredMessage(runtime, messageId, armoredMessage, senderPublicKeyArmored);
  if (!looksLikeMimeMessage(result.plaintext)) {
    log.debug(
      "[mail-crypto] decryptMailMessage: SUCCESS id=%s plaintext=%db sigState=%s",
      messageId,
      result.plaintext.length,
      result.signatureVerificationState,
    );
    return result;
  }

  const parsed = parseMimeBody(result.plaintext);
  log.debug(
    "[mail-crypto] decryptMailMessage: parsed inline MIME text=%s html=%s id=%s",
    parsed.text ? "yes" : "no",
    parsed.html ? "yes" : "no",
    messageId,
  );
  return {
    ...result,
    plaintext: parsed.text?.trim() ?? result.plaintext,
    html: parsed.html?.trim() ?? null,
    attachments: parsed.attachments,
  };
}

/** Encrypts a plaintext body for the recipient keys; callers add the sender key so sent mail stays readable here. */
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

/** Decrypts an RFC 3156 PGP/MIME message: ciphertext lives in `bodyStructure.subParts[1]`, body is postal-mime parsed. */
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

/** Decrypts an armored PGP message with the vault key and returns raw plaintext, shared by the inline and PGP/MIME paths. */
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
    log.error("[mail-crypto] decryptArmoredMessage: vault unlock failed");
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

/** True while the vault is unlocked in memory; drives lock indicators in the UI. */
export function isVaultLoaded(): boolean {
  return cachedVault !== null;
}

/** Fingerprint of the loaded vault's public key, or `null` while the vault is locked. */
export function getLoadedVaultFingerprint(): string | null {
  return cachedVault?.vault.publicKeyFingerprint ?? null;
}

/** Returns label definitions from the in-memory vault, or `[]` if not loaded. */
export function getVaultLabels(): LabelDef[] {
  return cachedVault?.vault.labels ?? [];
}

/** Persists label definitions into the encrypted vault backup so web and native stay in sync. */
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
