import {
  buildOutgoingMimeMessage,
  getEmailDomain,
  normalizeEmailAddress,
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
  mimeAttachments?: OutgoingMimeAttachment[];
  uploadPgpMimeCiphertext?: (
    armoredMessage: string,
  ) => Promise<{ blobId: string; size: number }>;
}): Promise<{
  textBody: string;
  encrypted: boolean;
  pgpMimeCiphertext?: { blobId: string; size: number };
}> {
  const internalDomain =
    input.runtime.config.defaultDomain.trim().toLowerCase() || null;
  if (!internalDomain) {
    return { textBody: input.plaintext, encrypted: false };
  }

  const internalRecipients = input.recipients.filter(
    (recipient) => getEmailDomain(recipient) === internalDomain,
  );

  if (
    internalRecipients.length === 0 ||
    internalRecipients.length !== input.recipients.length
  ) {
    return { textBody: input.plaintext, encrypted: false };
  }

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

  const encryptPayload =
    (input.mimeAttachments?.length ?? 0) > 0
      ? buildOutgoingMimeMessage({
          text: input.plaintext,
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
