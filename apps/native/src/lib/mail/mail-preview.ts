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

function stripQuotedReply(raw: string): string {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const patterns = [
    /\n\n---[ \t]*\n(?:[ \t]*\n)*(?=On .+?wrote:)/,
    /\n\n(?=On .{5,120}wrote:\s*\n)/,
    /\n[-]{3,}\s*(?:Original|Forwarded) Message\s*[-]{3,}\n/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.index && match.index > 0) {
      const body = normalized.slice(0, match.index).trimEnd();
      if (body) return body;
    }
  }
  return normalized;
}

function finalizePreview(raw: string): string {
  if (!raw.trim()) {
    return "";
  }
  if (containsArmoredPgpMessage(raw)) {
    return "";
  }
  return collapseWhitespace(stripQuotedReply(raw));
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

/**
 * Inbox-row snippet. Hides the "Encrypted message" placeholder so the list
 * can show decrypted text once it lands, instead of a useless always-on label.
 */
export function listPreviewSnippet(
  message: JmapEmailMessage,
  decrypted?: DecryptedMailPreviewContent | null,
): string {
  const snippet = buildMailPreviewSnippet(message, decrypted);
  if (!snippet || snippet === ENCRYPTED_MAIL_PREVIEW_PLACEHOLDER) {
    return "";
  }
  return snippet;
}
