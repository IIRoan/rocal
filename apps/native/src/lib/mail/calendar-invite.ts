import {
  hasCalendarInvitationMetadata,
  isCalendarAttachmentMeta,
  listCalendarAttachmentCandidates,
  looksLikeCalendarPayload,
  parseMailCalendarInviteFromIcs,
  type MailCalendarInvite,
} from "@workspace/calendar-core";
import type { JmapAttachment, JmapEmailMessage } from "./types";

export type { MailCalendarInvite };
export {
  hasCalendarInvitationMetadata,
  isCalendarAttachmentMeta,
  listCalendarAttachmentCandidates,
  looksLikeCalendarPayload,
};

function attachmentContentToString(
  content: JmapAttachment["content"],
): string | null {
  if (typeof content === "string") {
    return content;
  }
  if (content instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(content));
  }
  if (ArrayBuffer.isView(content)) {
    return new TextDecoder().decode(
      new Uint8Array(content.buffer, content.byteOffset, content.byteLength),
    );
  }
  return null;
}

function collectCalendarPayloads(input: {
  message?: JmapEmailMessage | null;
  plaintext?: string | null;
  attachments?: JmapAttachment[] | null;
}): string[] {
  const payloads = new Set<string>();

  for (const bodyValue of Object.values(input.message?.bodyValues ?? {})) {
    const value = bodyValue?.value?.trim();
    if (value && looksLikeCalendarPayload(value)) {
      payloads.add(value);
    }
  }

  const plaintext = input.plaintext?.trim();
  if (plaintext && looksLikeCalendarPayload(plaintext)) {
    payloads.add(plaintext);
  }

  for (const attachment of input.attachments ?? []) {
    const content = attachmentContentToString(attachment.content)?.trim();
    if (!content) {
      continue;
    }

    if (
      isCalendarAttachmentMeta(attachment.type, attachment.name) ||
      looksLikeCalendarPayload(content)
    ) {
      payloads.add(content);
    }
  }

  return [...payloads];
}

export function extractMailCalendarInvite(input: {
  message?: JmapEmailMessage | null;
  plaintext?: string | null;
  attachments?: JmapAttachment[] | null;
}): MailCalendarInvite | null {
  const icsContent = collectCalendarPayloads(input).find((value) =>
    looksLikeCalendarPayload(value),
  );
  if (!icsContent) return null;

  return parseMailCalendarInviteFromIcs(
    icsContent,
    input.message?.subject ?? null,
  );
}
