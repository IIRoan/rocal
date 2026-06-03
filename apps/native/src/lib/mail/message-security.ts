/**
 * Message body extraction and encryption classification.
 *
 * Ported from the web app's `lib/mail/message-security.ts` (the crypto-free
 * subset). Used to decide whether a message can be rendered on-device
 * (plaintext / encrypted-at-rest) or must be opened in the secure web client
 * (PGP end-to-end encrypted).
 */
import type {
  JmapAttachment,
  JmapBodyStructure,
  JmapBodyValue,
  JmapEmailMessage,
  MessageEncryptionState,
} from "./types";

function getBodyValue(
  bodyValues: Record<string, JmapBodyValue> | undefined,
  partId: string | undefined,
): string | null {
  if (!bodyValues || !partId) {
    return null;
  }

  const value = bodyValues[partId]?.value;
  return typeof value === "string" ? value : null;
}

function stripHtmlTags(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractMessageBodies(message: JmapEmailMessage): {
  text: string | null;
  html: string | null;
} {
  const textPartId = message.textBody?.[0]?.partId;
  const htmlPartId = message.htmlBody?.[0]?.partId;
  const text = getBodyValue(message.bodyValues, textPartId);
  const html = getBodyValue(message.bodyValues, htmlPartId);

  if (text || html) {
    return {
      text,
      html,
    };
  }

  const firstValue = Object.values(message.bodyValues ?? {}).find(
    (entry) => typeof entry.value === "string" && entry.value.length > 0,
  )?.value;

  if (!firstValue) {
    return { text: null, html: null };
  }

  if (firstValue.includes("<") && firstValue.includes(">")) {
    return {
      text: stripHtmlTags(firstValue),
      html: firstValue,
    };
  }

  return {
    text: firstValue,
    html: null,
  };
}

/**
 * Extracts the blobId of the PGP/MIME ciphertext part.
 *
 * RFC 3156 structure:
 *   multipart/encrypted
 *     └─ subParts[0]: application/pgp-encrypted  (version notice)
 *     └─ subParts[1]: application/octet-stream   (armored ciphertext)
 */
export function extractPgpMimeCiphertextBlobId(
  bodyStructure: JmapBodyStructure | undefined,
): string | null {
  if (bodyStructure?.type?.toLowerCase() !== "multipart/encrypted") return null;
  return bodyStructure.subParts?.[1]?.blobId ?? null;
}

export function classifyMessageEncryption(
  message: Pick<
    JmapEmailMessage,
    "attachments" | "bodyStructure" | "bodyValues" | "htmlBody" | "textBody"
  >,
): MessageEncryptionState {
  const { text } = extractMessageBodies(message as JmapEmailMessage);

  if (text?.includes("-----BEGIN PGP MESSAGE-----")) {
    return "inline_pgp";
  }

  const topType = message.bodyStructure?.type?.toLowerCase() ?? "";
  if (topType === "multipart/encrypted") {
    return "pgp_mime";
  }

  // Only flag as encrypted if attachment has an explicit PGP MIME type
  // — never match on application/octet-stream which is any binary file
  const hasEncryptedAttachment = (message.attachments ?? []).some(
    (attachment) => {
      const type = attachment.type?.toLowerCase() ?? "";
      const name = attachment.name?.toLowerCase() ?? "";
      return (
        type === "application/pgp-encrypted" ||
        type === "application/pgp-keys" ||
        (name.endsWith(".asc") && name !== "smime.p7s") ||
        name.endsWith(".pgp") ||
        name.endsWith(".gpg")
      );
    },
  );

  if (hasEncryptedAttachment) {
    return "unknown_encrypted";
  }

  return "plain";
}

export function isEncryptedState(state: MessageEncryptionState): boolean {
  return state !== "plain";
}

/**
 * Returns true for raw PGP control parts that should not be shown as
 * user-visible attachments (e.g. `encrypted.asc`, `application/pgp-encrypted`).
 *
 * Mirrors the filtering the web app applies when it replaces raw attachments
 * with decrypted ones after PGP/MIME decryption.
 */
export function messageHasVisibleAttachments(message: {
  attachments?: { name?: string | null; type?: string | null }[];
}): boolean {
  return (message.attachments ?? []).some((attachment) => !isHiddenAttachment(attachment));
}

export function isHiddenAttachment(attachment: { name?: string | null; type?: string | null }): boolean {
  const type = attachment.type?.toLowerCase() ?? "";
  const name = attachment.name?.toLowerCase() ?? "";
  return (
    type === "application/pgp-encrypted" ||
    type === "application/pgp-keys" ||
    (name.endsWith(".asc") && name !== "smime.p7s") ||
    name.endsWith(".pgp") ||
    name.endsWith(".gpg")
  );
}

/**
 * Resolves which attachments to show in the message reader.
 * PGP/MIME uses decrypted attachments only (empty while decrypting / on failure).
 */
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
