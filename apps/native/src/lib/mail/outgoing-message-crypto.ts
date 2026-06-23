import {
  buildOutgoingMimeMessage,
  getEmailDomain,
  normalizeEmailAddress,
  resolveEncryptionInternalDomain,
  shouldEncryptOutgoingMail,
  type OutgoingMimeAttachment,
} from "@workspace/calendar-core";
import { getRecipientKey } from "./mail-api";
import {
  encryptForRecipients,
  ensureVaultLoaded,
} from "./mail-crypto";
import type { MailRuntime } from "./mail-runtime";

export async function resolveOutgoingMessageBody(input: {
  runtime: MailRuntime;
  recipients: string[];
  plaintext: string;
  html?: string;
  mimeAttachments?: OutgoingMimeAttachment[];
  uploadPgpMimeCiphertext?: (
    armoredMessage: string,
  ) => Promise<{ blobId: string; size: number }>;
}): Promise<{
  textBody: string;
  encrypted: boolean;
  pgpMimeCiphertext?: { blobId: string; size: number };
}> {
  const internalDomain = resolveEncryptionInternalDomain(
    input.runtime.config.defaultDomain,
  );
  if (!shouldEncryptOutgoingMail(input.recipients, internalDomain)) {
    return { textBody: input.plaintext, encrypted: false };
  }

  const internalRecipients = input.recipients.filter(
    (recipient) => getEmailDomain(recipient) === internalDomain,
  );

  const unlockedVault = await ensureVaultLoaded(input.runtime);
  const senderEmail = normalizeEmailAddress(
    input.runtime.identities[0]?.email ?? "",
  );
  const recipientPublicKeysArmored = new Set<string>([
    unlockedVault.vault.publicKeyArmored,
  ]);

  for (const recipient of internalRecipients) {
    if (recipient === senderEmail) {
      recipientPublicKeysArmored.add(unlockedVault.vault.publicKeyArmored);
      continue;
    }

    const recipientKey = await getRecipientKey(recipient);
    recipientPublicKeysArmored.add(recipientKey.publicKeyArmored);
  }

  const shouldUseMime =
    Boolean(input.html?.trim()) || (input.mimeAttachments?.length ?? 0) > 0;
  const encryptPayload = shouldUseMime
    ? buildOutgoingMimeMessage({
        text: input.plaintext,
        html: input.html,
        attachments: input.mimeAttachments,
      })
    : input.plaintext;

  const { armoredMessage } = await encryptForRecipients({
    plaintext: encryptPayload,
    recipientPublicKeysArmored: [...recipientPublicKeysArmored],
  });

  if ((input.mimeAttachments?.length ?? 0) > 0) {
    if (!input.uploadPgpMimeCiphertext) {
      throw new Error("PGP/MIME ciphertext upload is not configured.");
    }
    const uploaded = await input.uploadPgpMimeCiphertext(armoredMessage);
    return {
      textBody: "",
      encrypted: true,
      pgpMimeCiphertext: uploaded,
    };
  }

  return { textBody: armoredMessage, encrypted: true };
}
