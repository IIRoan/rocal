import {
  containsArmoredPgpMessage,
  isCompleteArmoredPgpMessage,
} from "./mail-pgp-layers";
import type {
  JmapBodyStructure,
  JmapBodyValue,
  JmapMessageBody,
} from "./mail-jmap-types";
import type { MessageEncryptionState } from "./mail-types";
import { stripHtmlTags } from "./html-text";

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

function htmlToText(value: string): string {
  return stripHtmlTags(value).replace(/\s+/g, " ").trim();
}

export function extractMessageBodies(message: JmapMessageBody): {
  text: string | null;
  html: string | null;
} {
  const textPartId = message.textBody?.[0]?.partId;
  const htmlPartId = message.htmlBody?.[0]?.partId;
  const text = getBodyValue(message.bodyValues, textPartId);
  const html = getBodyValue(message.bodyValues, htmlPartId);

  if (text || html) {
    // Inline PGP lives in the text part; ignore any stale HTML preview from drafts.
    if (containsArmoredPgpMessage(text)) {
      return { text, html: null };
    }
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
      text: htmlToText(firstValue),
      html: firstValue,
    };
  }

  return {
    text: firstValue,
    html: null,
  };
}

function firstBodyBlobId(
  part: JmapBodyStructure | undefined,
  type?: string,
): string | null {
  if (!part) return null;
  if (part.blobId && (!type || part.type?.toLowerCase() === type))
    return part.blobId;
  for (const child of part.subParts ?? []) {
    const blobId = firstBodyBlobId(child, type);
    if (blobId) return blobId;
  }
  return null;
}

export function extractTextBodyBlobId(
  bodyStructure: JmapBodyStructure | undefined,
): string | null {
  return firstBodyBlobId(bodyStructure, "text/plain");
}

export function extractEncryptedBodyBlobId(
  message: JmapMessageBody,
): string | null {
  return extractMessageBodies(message).text?.trim()
    ? null
    : firstBodyBlobId(message.bodyStructure);
}

export async function resolveInlinePgpArmoredCiphertext(input: {
  message: JmapMessageBody;
  fetchBlob: (blobId: string) => Promise<string>;
}): Promise<string> {
  const { text } = extractMessageBodies(input.message);
  if (text && isCompleteArmoredPgpMessage(text)) {
    return text.trim();
  }

  const blobId =
    extractTextBodyBlobId(input.message.bodyStructure) ??
    extractEncryptedBodyBlobId(input.message);
  if (blobId) {
    const armored = (await input.fetchBlob(blobId)).trim();
    if (armored) {
      return armored;
    }
  }

  if (text?.trim()) {
    return text.trim();
  }

  throw new Error("No armored PGP body found in this message.");
}

export function extractPgpMimeCiphertextBlobId(
  bodyStructure: JmapBodyStructure | undefined,
): string | null {
  if (bodyStructure?.type?.toLowerCase() !== "multipart/encrypted") return null;
  // PGP/MIME: subParts[0] = version notice, subParts[1] = ciphertext blob
  return bodyStructure.subParts?.[1]?.blobId ?? null;
}

export function isPgpAttachment(attachment: {
  name?: string | null;
  type?: string | null;
}): boolean {
  const type = attachment.type?.toLowerCase() ?? "";
  const name = attachment.name?.toLowerCase() ?? "";
  return (
    type === "application/pgp-encrypted" ||
    type === "application/pgp-keys" ||
    name.endsWith(".asc") ||
    name.endsWith(".pgp") ||
    name.endsWith(".gpg")
  );
}

export function classifyMessageEncryption(
  message: JmapMessageBody & {
    attachments?: { type?: string | null; name?: string | null }[];
  },
): MessageEncryptionState {
  if (containsArmoredPgpMessage(extractMessageBodies(message).text))
    return "inline_pgp";
  if (message.bodyStructure?.type?.toLowerCase() === "multipart/encrypted")
    return "pgp_mime";
  return message.attachments?.some(isPgpAttachment)
    ? "unknown_encrypted"
    : "plain";
}
