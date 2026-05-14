import type {
  JmapBodyStructure,
  JmapBodyValue,
  JmapEmailMessage,
  MailSignatureVerificationState,
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

export function resolveSecurityLabels(input: {
  messageState: MessageEncryptionState;
  accountEncryptedAtRest: boolean;
  hasVerifiedSignature: boolean;
  decryptionFailed: boolean;
}): string[] {
  const labels: string[] = [];

  if (
    input.messageState === "inline_pgp" ||
    input.messageState === "pgp_mime" ||
    input.messageState === "internal_e2ee"
  ) {
    labels.push("E2EE encrypted");
  } else if (input.messageState === "plain" && !input.accountEncryptedAtRest) {
    labels.push("Plain");
  }

  if (input.accountEncryptedAtRest) {
    labels.push("Encrypted at rest");
  }

  if (input.hasVerifiedSignature) {
    labels.push("Signature verified");
  }

  if (input.decryptionFailed) {
    labels.push("Decryption failed");
  }

  return labels;
}

export function resolveMessageSecurityLabel(input: {
  messageState: MessageEncryptionState;
  accountEncryptedAtRest: boolean;
  signatureVerificationState: MailSignatureVerificationState;
  decryptionFailed: boolean;
}): string {
  if (input.decryptionFailed) {
    return "Decryption failed";
  }

  if (input.accountEncryptedAtRest) {
    return "Stored encrypted at rest";
  }

  if (
    input.messageState === "inline_pgp" ||
    input.messageState === "pgp_mime" ||
    input.messageState === "internal_e2ee"
  ) {
    if (input.signatureVerificationState === "failed") {
      return "PGP encrypted, signature check failed";
    }

    if (input.signatureVerificationState === "unverified") {
      return "PGP encrypted, signature not verified";
    }

    return input.signatureVerificationState === "verified"
      ? "PGP encrypted & verified"
      : "PGP encrypted";
  }

  if (input.messageState === "unknown_encrypted") {
    return "Possibly encrypted";
  }

  return "Not encrypted";
}

export function extractPgpMimeCiphertextBlobId(
  bodyStructure: JmapBodyStructure | undefined,
): string | null {
  if (bodyStructure?.type?.toLowerCase() !== "multipart/encrypted") return null;
  // PGP/MIME: subParts[0] = version notice, subParts[1] = ciphertext blob
  return bodyStructure.subParts?.[1]?.blobId ?? null;
}
