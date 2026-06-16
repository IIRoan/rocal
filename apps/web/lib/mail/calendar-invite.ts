import {
  hasCalendarInvitationMetadata,
  isCalendarAttachmentMeta,
  listCalendarAttachmentCandidates,
  looksLikeCalendarPayload,
  parseMailCalendarInviteFromIcs,
  type MailCalendarInvite,
} from "@workspace/calendar-core";
import type { JmapEmailMessage, MailAttachment } from "./types";

export type { MailCalendarInvite };
export {
  hasCalendarInvitationMetadata,
  isCalendarAttachmentMeta,
  listCalendarAttachmentCandidates,
  looksLikeCalendarPayload,
};

function normalizeContentType(value?: string | null): string {
  return value?.split(";")[0]?.trim().toLowerCase() ?? "";
}

function hasIcsFilename(value?: string | null): boolean {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized.endsWith(".ics") || normalized.endsWith(".ical");
}

function attachmentContentToString(
  content: MailAttachment["content"],
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
  attachments?: MailAttachment[] | null;
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

    const isCalendarAttachment =
      normalizeContentType(attachment.type) === "text/calendar" ||
      hasIcsFilename(attachment.name);
    if (isCalendarAttachment || looksLikeCalendarPayload(content)) {
      payloads.add(content);
    }
  }

  return [...payloads];
}

export function extractMailCalendarInvite(input: {
  message?: JmapEmailMessage | null;
  plaintext?: string | null;
  attachments?: MailAttachment[] | null;
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
