import {
  getEmailDomain,
  normalizeEmailAddress,
  resolveEncryptionInternalDomain,
} from "@workspace/calendar-core";
import { getRecipientKey } from "./mail-api";
import {
  decryptMailMessage,
  decryptPgpMimeMessage,
  ensureVaultLoaded,
  type MailDecryptResult,
} from "./mail-crypto";
import {
  classifyMessageEncryption,
  resolveInlinePgpArmoredCiphertext,
} from "./message-security";
import type { MailRuntime } from "./mail-runtime";
import type { JmapEmailMessage } from "./types";

/** Best-effort sender key so decrypt can verify signatures, not only unwrap. */
export async function resolveSenderVerificationKey(
  runtime: MailRuntime,
  senderEmail: string | undefined,
): Promise<string | undefined> {
  const email = senderEmail ? normalizeEmailAddress(senderEmail) : "";
  if (!email) {
    return undefined;
  }

  const selfEmails = new Set(
    [runtime.session.username, ...runtime.identities.map((identity) => identity.email)]
      .filter((value): value is string => Boolean(value))
      .map((value) => normalizeEmailAddress(value)),
  );

  if (selfEmails.has(email)) {
    try {
      const unlocked = await ensureVaultLoaded(runtime);
      return unlocked.vault.publicKeyArmored;
    } catch {
      return undefined;
    }
  }

  const internalDomain = resolveEncryptionInternalDomain(
    runtime.config.defaultDomain,
  );
  if (!internalDomain || getEmailDomain(email) !== internalDomain) {
    return undefined;
  }

  try {
    const key = await getRecipientKey(email);
    return key.publicKeyArmored;
  } catch {
    return undefined;
  }
}

/** Decrypt an encrypted JMAP message and verify the sender signature when possible. */
export async function decryptEncryptedMessage(
  runtime: MailRuntime,
  message: JmapEmailMessage,
): Promise<MailDecryptResult> {
  const senderPublicKeyArmored = await resolveSenderVerificationKey(
    runtime,
    message.from?.[0]?.email,
  );
  const encryption = classifyMessageEncryption(message);

  if (encryption === "inline_pgp") {
    const armoredMessage = await resolveInlinePgpArmoredCiphertext({
      message,
      fetchBlob: (blobId) =>
        runtime.client.getBlobAsText(runtime.session, blobId),
    });
    return decryptMailMessage(
      runtime,
      message.id,
      armoredMessage,
      senderPublicKeyArmored,
    );
  }

  if (encryption === "pgp_mime") {
    return decryptPgpMimeMessage(
      runtime,
      message.id,
      message.bodyStructure,
      senderPublicKeyArmored,
    );
  }

  throw new Error(`Unsupported encryption type: ${encryption}`);
}
