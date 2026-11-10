import {
  assertMailMimeLimits,
  MAX_MAIL_MIME_DEPTH,
  MAX_MAIL_MIME_HEADER_BYTES,
} from "@workspace/calendar-core/mail-mime-limits";
import {
  looksLikeMimeMessage,
  resolveNestedPgpMimeCiphertext,
  getPgpMimeEnvelopeContentType,
} from "@workspace/calendar-core";
import PostalMime, {
  type Attachment as ParsedMailAttachment,
} from "postal-mime";

export type DecryptedMailContent = {
  text: string | null;
  html: string | null;
  attachments: ParsedMailAttachment[];
};

export async function parseDecryptedMailContent(
  plaintext: string,
): Promise<DecryptedMailContent> {
  if (!looksLikeMimeMessage(plaintext)) {
    return {
      text: plaintext,
      html: null,
      attachments: [],
    };
  }

  assertMailMimeLimits(plaintext);
  const parsed = await PostalMime.parse(plaintext, {
    attachmentEncoding: "arraybuffer",
    forceRfc822Attachments: true,
    maxNestingDepth: MAX_MAIL_MIME_DEPTH,
    maxHeadersSize: MAX_MAIL_MIME_HEADER_BYTES,
  });

  return {
    text: parsed.text?.trim() ?? null,
    html: parsed.html?.trim() ?? null,
    attachments: parsed.attachments.map((attachment) =>
      attachment.mimeType === "message/rfc822" && !attachment.filename
        ? { ...attachment, filename: "message.eml" }
        : attachment,
    ),
  };
}

export async function extractNestedPgpMimeCiphertext(
  plaintext: string,
): Promise<string | null> {
  const contentType = getPgpMimeEnvelopeContentType(plaintext);
  if (!contentType) return null;
  assertMailMimeLimits(plaintext);
  const parsed = await PostalMime.parse(plaintext, {
    attachmentEncoding: "arraybuffer",
    forceRfc822Attachments: true,
    maxNestingDepth: MAX_MAIL_MIME_DEPTH,
    maxHeadersSize: MAX_MAIL_MIME_HEADER_BYTES,
  });
  return resolveNestedPgpMimeCiphertext({
    contentType,
    parts: parsed.attachments.map((attachment) => ({
      type: attachment.mimeType,
      body:
        typeof attachment.content === "string"
          ? attachment.content
          : new TextDecoder().decode(attachment.content),
    })),
  });
}
