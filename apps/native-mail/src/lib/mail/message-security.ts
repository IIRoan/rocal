import {
  containsArmoredPgpMessage,
  classifyMessageEncryption as classifyBodyEncryption,
  isPgpAttachment as isHiddenAttachment,
} from "@workspace/calendar-core";
import type {
  JmapAttachment,
  JmapEmailMessage,
  MessageEncryptionState,
} from "./types";

export { isHiddenAttachment };

export {
  extractEncryptedBodyBlobId,
  extractMessageBodies,
  extractPgpMimeCiphertextBlobId,
  extractTextBodyBlobId,
  resolveInlinePgpArmoredCiphertext,
} from "@workspace/calendar-core";

export function classifyMessageEncryption(
  message: Pick<
    JmapEmailMessage,
    | "attachments"
    | "bodyStructure"
    | "bodyValues"
    | "htmlBody"
    | "textBody"
    | "preview"
  >,
): MessageEncryptionState {
  // Rows omit body values, so their preview can be the only evidence of inline PGP.
  if (!message.bodyValues && containsArmoredPgpMessage(message.preview)) return "inline_pgp";
  return classifyBodyEncryption(message);
}

export function isEncryptedState(state: MessageEncryptionState): boolean {
  return state !== "plain";
}

/** True for raw PGP control parts (`encrypted.asc`, `application/pgp-encrypted`) that must not show as attachments. */
export function messageHasVisibleAttachments(message: {
  attachments?: { name?: string | null; type?: string | null }[];
}): boolean {
  return (message.attachments ?? []).some((attachment) => !isHiddenAttachment(attachment));
}

/** Attachments to show in the reader; PGP/MIME shows decrypted attachments only. */
export function resolveDisplayAttachments(input: {
  encryption: MessageEncryptionState;
  isDecrypting: boolean;
  decryptSucceeded: boolean;
  decryptedAttachments?: JmapAttachment[];
  messageAttachments?: JmapAttachment[];
}): JmapAttachment[] {
  if (input.encryption === "pgp_mime") {
    if (input.isDecrypting) {
      return [];
    }
    if (input.decryptSucceeded) {
      return (input.decryptedAttachments ?? []).filter((a) => !isHiddenAttachment(a));
    }
    return [];
  }

  const raw = input.decryptedAttachments ?? input.messageAttachments ?? [];
  return raw.filter((a) => !isHiddenAttachment(a));
}
