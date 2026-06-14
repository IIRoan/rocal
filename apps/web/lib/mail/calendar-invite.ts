import type { JmapEmailMessage, MailAttachment } from "./types";

export type MailCalendarInvite = {
  uid: string;
  method: "REQUEST" | "CANCEL" | "REPLY" | string;
  title: string;
  location?: string;
  start?: Date;
  end?: Date;
  icsContent: string;
};

function unfoldIcsLines(content: string): string[] {
  return content
    .replace(/\r\n[ \t]/g, "")
    .replace(/\n[ \t]/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function unescapeIcsText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function readProperty(lines: string[], name: string): string | null {
  const prefix = name.toUpperCase();
  const line = lines.find((entry) => {
    const [propertyName] = entry.split(/[:;]/, 1);
    return propertyName?.toUpperCase() === prefix;
  });
  const separatorIndex = line?.indexOf(":") ?? -1;
  return separatorIndex >= 0
    ? unescapeIcsText(line!.slice(separatorIndex + 1))
    : null;
}

function readComponentLines(lines: string[], componentName: string): string[] {
  const upperName = componentName.toUpperCase();
  const startIndex = lines.findIndex(
    (line) => line.toUpperCase() === `BEGIN:${upperName}`,
  );
  if (startIndex < 0) {
    return [];
  }

  const endIndex = lines.findIndex(
    (line, index) =>
      index > startIndex && line.toUpperCase() === `END:${upperName}`,
  );
  if (endIndex < 0) {
    return lines.slice(startIndex + 1);
  }

  return lines.slice(startIndex + 1, endIndex);
}

function parseIcsDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const match = value.match(
    /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/,
  );
  if (!match) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  const [, year, month, day, hour = "00", minute = "00", second = "00", z] =
    match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}${z ? "Z" : ""}`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function looksLikeCalendarPayload(value: string): boolean {
  return /BEGIN:VCALENDAR/i.test(value);
}

function normalizeContentType(value?: string | null): string {
  return value?.split(";")[0]?.trim().toLowerCase() ?? "";
}

function hasIcsFilename(value?: string | null): boolean {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized.endsWith(".ics") || normalized.endsWith(".ical");
}

export function isCalendarAttachmentMeta(
  type?: string | null,
  name?: string | null,
): boolean {
  return (
    normalizeContentType(type) === "text/calendar" || hasIcsFilename(name)
  );
}

function walkBodyStructureForCalendarBlobs(
  part: JmapEmailMessage["bodyStructure"],
  seen: Set<string>,
  candidates: Array<{ blobId: string; name?: string; type?: string }>,
): void {
  if (!part) {
    return;
  }

  const blobId = part.blobId?.trim();
  if (
    blobId &&
    !seen.has(blobId) &&
    isCalendarAttachmentMeta(part.type, part.name)
  ) {
    seen.add(blobId);
    candidates.push({
      blobId,
      name: part.name ?? undefined,
      type: part.type ?? undefined,
    });
  }

  for (const subPart of part.subParts ?? []) {
    walkBodyStructureForCalendarBlobs(subPart, seen, candidates);
  }
}

export function listCalendarAttachmentCandidates(
  message: Pick<JmapEmailMessage, "attachments" | "bodyStructure">,
): Array<{ blobId: string; name?: string; type?: string }> {
  const seen = new Set<string>();
  const candidates: Array<{ blobId: string; name?: string; type?: string }> =
    [];

  for (const attachment of message.attachments ?? []) {
    const blobId = attachment.blobId?.trim();
    if (!blobId || seen.has(blobId)) {
      continue;
    }
    if (isCalendarAttachmentMeta(attachment.type, attachment.name)) {
      seen.add(blobId);
      candidates.push({
        blobId,
        name: attachment.name ?? undefined,
        type: attachment.type ?? undefined,
      });
    }
  }

  walkBodyStructureForCalendarBlobs(message.bodyStructure, seen, candidates);
  return candidates;
}

export function hasCalendarInvitationMetadata(
  message: Pick<JmapEmailMessage, "attachments" | "bodyStructure" | "subject">,
): boolean {
  if (listCalendarAttachmentCandidates(message).length > 0) {
    return true;
  }

  const subject = message.subject?.trim() ?? "";
  return (
    /\binvited you to\b/i.test(subject) ||
    /\b(?:invitation|invite):\b/i.test(subject)
  );
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

  const lines = unfoldIcsLines(icsContent);
  const method = (readProperty(lines, "METHOD") ?? "REQUEST").toUpperCase();
  const eventLines = readComponentLines(lines, "VEVENT");

  const uid = readProperty(eventLines, "UID");
  if (!uid) return null;

  return {
    uid,
    method,
    title:
      readProperty(eventLines, "SUMMARY") ||
      input.message?.subject ||
      "Invitation",
    location: readProperty(eventLines, "LOCATION") ?? undefined,
    start: parseIcsDate(readProperty(eventLines, "DTSTART")),
    end: parseIcsDate(readProperty(eventLines, "DTEND")),
    icsContent,
  };
}
