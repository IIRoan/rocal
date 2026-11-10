import {
  captureSessionDataScope,
  isSessionDataScopeCurrent,
} from "@workspace/native-core/lib/session-data-lifecycle";
import {
  normalizeEmailAddress,
  MAIL_KEY_CONTINUITY_ENABLED,
  MailTrustBlockedError,
  type MailSenderVerification,
  resolveMailSenderKeySource,
  collectOwnMailAddresses,
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

const directoryKeyLookups = new Map<string, Promise<string | undefined>>();

export function clearSenderKeyCache(): void {
  directoryKeyLookups.clear();
}

/** One directory lookup per sender; failures are forgotten so the next message retries. */
function lookupDirectoryKey(email: string): Promise<string | undefined> {
  let lookup = directoryKeyLookups.get(email);
  if (!lookup) {
    lookup = getRecipientKey(email).then(
      (key) => key.publicKeyArmored,
      () => {
        directoryKeyLookups.delete(email);
        return undefined;
      },
    );
    directoryKeyLookups.set(email, lookup);
  }
  return lookup;
}

/** Best-effort sender key so decrypt can verify signatures, not only unwrap. */
export async function resolveSenderVerification(
  runtime: MailRuntime,
  senderEmail: string | undefined,
): Promise<MailSenderVerification> {
  const email = senderEmail ? normalizeEmailAddress(senderEmail) : "";
  if (!email) {
    return { senderKeyTrustState: { kind: "not_applicable" } };
  }

  const source = resolveMailSenderKeySource({
    senderEmail: email,
    ownAddresses: collectOwnMailAddresses([
      runtime.session.username,
      ...runtime.identities.map((identity) => identity.email),
    ]),
    internalDomain: runtime.config.defaultDomain,
  });

  if (source === "self") {
    try {
      const unlocked = await ensureVaultLoaded(runtime);
      return {
        senderPublicKeyArmored: unlocked.vault.publicKeyArmored,
        senderKeyTrustState: { kind: "self" },
      };
    } catch {
      return {
        senderKeyTrustState: { kind: "unavailable", reason: "history" },
      };
    }
  }

  if (source !== "directory")
    return { senderKeyTrustState: { kind: "not_applicable" } };

  if (MAIL_KEY_CONTINUITY_ENABLED) {
    const scope = captureSessionDataScope();
    const { inspectPinnedMailSender } = await import("./mail-trust");
    if (!isSessionDataScopeCurrent(scope))
      throw new Error("Mail encryption session changed.");
    const result = await inspectPinnedMailSender(runtime, email, async () => {
      const key = await lookupDirectoryKey(email);
      if (!key) throw new Error("Sender key is unavailable.");
      return key;
    }).catch((error: unknown): MailSenderVerification => {
      if (error instanceof MailTrustBlockedError)
        return {
          senderKeyTrustState: { kind: "unavailable", reason: "history" },
        };
      throw error;
    });
    if (!isSessionDataScopeCurrent(scope))
      throw new Error("Mail encryption session changed.");
    return result;
  }
  return { senderPublicKeyArmored: await lookupDirectoryKey(email) };
}

export async function resolveSenderVerificationKey(
  runtime: MailRuntime,
  senderEmail: string | undefined,
): Promise<string | undefined> {
  return (await resolveSenderVerification(runtime, senderEmail))
    .senderPublicKeyArmored;
}

/** Decrypt an encrypted JMAP message and verify the sender signature when possible. */
export async function decryptEncryptedMessage(
  runtime: MailRuntime,
  message: JmapEmailMessage,
): Promise<MailDecryptResult> {
  const scope = captureSessionDataScope();
  const assertCurrent = () => {
    if (!isSessionDataScopeCurrent(scope))
      throw new Error("Mail encryption session changed.");
  };
  assertCurrent();
  const verification = await resolveSenderVerification(
    runtime,
    message.from?.[0]?.email,
  );
  assertCurrent();
  const senderPublicKeyArmored = verification.senderPublicKeyArmored;
  const encryption = classifyMessageEncryption(message);

  if (encryption === "inline_pgp") {
    const armoredMessage = await resolveInlinePgpArmoredCiphertext({
      message,
      fetchBlob: (blobId) =>
        runtime.client.getBlobAsText(runtime.session, blobId),
    });
    assertCurrent();
    const result = await decryptMailMessage(
      runtime,
      message.id,
      armoredMessage,
      senderPublicKeyArmored,
    );
    assertCurrent();
    return { ...result, senderKeyTrustState: verification.senderKeyTrustState };
  }

  if (encryption === "pgp_mime") {
    const result = await decryptPgpMimeMessage(
      runtime,
      message.id,
      message.bodyStructure,
      senderPublicKeyArmored,
    );
    assertCurrent();
    return { ...result, senderKeyTrustState: verification.senderKeyTrustState };
  }

  throw new Error(`Unsupported encryption type: ${encryption}`);
}
