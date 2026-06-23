import { looksLikeMimeMessage } from "@workspace/calendar-core";
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

  const parsed = await PostalMime.parse(plaintext, {
    attachmentEncoding: "arraybuffer",
  });

  return {
    text: parsed.text?.trim() ?? null,
    html: parsed.html?.trim() ?? null,
    attachments: parsed.attachments,
  };
}
