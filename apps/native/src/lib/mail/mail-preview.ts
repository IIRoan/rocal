import { containsArmoredPgpMessage } from "./pgp-layers";
import {
  classifyMessageEncryption,
  extractMessageBodies,
} from "./message-security";
import type { JmapEmailMessage } from "./types";

export const ENCRYPTED_MAIL_PREVIEW_PLACEHOLDER = "Encrypted message";

export type DecryptedMailPreviewContent = {
  text?: string | null;
  html?: string | null;
};

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripHtmlToText(html: string): string {
  return html.replace(/<[^>]+>/g, " ");
}

function finalizePreview(raw: string): string {
  if (!raw.trim()) {
    return "";
  }
  if (containsArmoredPgpMessage(raw)) {
    return "";
  }
  return collapseWhitespace(raw);
}

/** True when conversation/list preview needs local decryption. */
export function messageNeedsDecryptedPreview(
  message: Pick<
    JmapEmailMessage,
    | "attachments"
    | "bodyStructure"
    | "bodyValues"
    | "htmlBody"
    | "textBody"
    | "preview"
  >,
): boolean {
  const state = classifyMessageEncryption(message);
  if (state === "inline_pgp" || state === "pgp_mime") {
    return true;
  }
  return containsArmoredPgpMessage(message.preview);
}

/** Build a one-line list/thread preview. Never returns raw PGP armor. */
export function buildMailPreviewSnippet(
  message: JmapEmailMessage,
  decrypted?: DecryptedMailPreviewContent | null,
): string {
  if (decrypted?.text?.trim()) {
    return finalizePreview(decrypted.text);
  }
  if (decrypted?.html?.trim()) {
    return finalizePreview(stripHtmlToText(decrypted.html));
  }

  const bodies = extractMessageBodies(message);
  let raw: string;
  if (bodies.html && !bodies.text) {
    raw = stripHtmlToText(bodies.html);
  } else {
    raw = bodies.text ?? message.preview ?? "";
  }

  const preview = finalizePreview(raw);
  if (preview) {
    return preview;
  }

  if (messageNeedsDecryptedPreview(message) || containsArmoredPgpMessage(raw)) {
    return ENCRYPTED_MAIL_PREVIEW_PLACEHOLDER;
  }

  return "";
}
