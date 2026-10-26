import {
  formatQuotedMailDate,
  resolveReplyRecipients,
  stripHtmlTags,
  type QuotedDateOptions,
} from "@workspace/calendar-core";
import { extractMessageBodies } from "./message-security";
import type { JmapEmailMessage, MailAddress } from "./types";

export function prefixSubject(
  value: string | null | undefined,
  prefix: "Re:" | "Fwd:",
) {
  const normalized = value?.trim() || "(no subject)";
  return normalized.toLowerCase().startsWith(prefix.toLowerCase())
    ? normalized
    : `${prefix} ${normalized}`;
}

export function formatAddressList(addresses: MailAddress[] | undefined): string {
  return (addresses ?? [])
    .map((entry) => entry.email?.trim())
    .filter((value): value is string => Boolean(value))
    .join(", ");
}

function getReplyRecipients(
  message: JmapEmailMessage,
  currentUserEmail?: string | null,
): string {
  return resolveReplyRecipients({
    from: message.from,
    to: message.to,
    cc: message.cc,
    currentUserEmail,
  }).join(", ");
}

export function buildReplyBody(
  message: JmapEmailMessage,
  dateOptions: QuotedDateOptions,
): string {
  const sender =
    message.from?.[0]?.name?.trim() ||
    message.from?.[0]?.email?.trim() ||
    "Unknown sender";
  const receivedAt = formatQuotedMailDate(message.receivedAt, dateOptions);
  const bodies = extractMessageBodies(message);
  const source = bodies.text?.trim() || stripHtmlToText(bodies.html);
  const quoted = source
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");

  return `\n\nOn ${receivedAt}, ${sender} wrote:\n${quoted}`;
}

export function buildForwardBody(
  message: JmapEmailMessage,
  dateOptions: QuotedDateOptions,
): string {
  const bodies = extractMessageBodies(message);
  const textBody = bodies.text?.trim() || stripHtmlToText(bodies.html);
  const from = getReplyRecipients(message) || "Unknown sender";
  const to = (message.to ?? [])
    .map((entry) => entry.email?.trim())
    .filter((value): value is string => Boolean(value))
    .join(", ");
  const cc = (message.cc ?? [])
    .map((entry) => entry.email?.trim())
    .filter((value): value is string => Boolean(value))
    .join(", ");
  const date = formatQuotedMailDate(message.receivedAt, dateOptions);

  return [
    "",
    "",
    "---------- Forwarded message ----------",
    `From: ${from}`,
    `Date: ${date}`,
    ...(to ? [`To: ${to}`] : []),
    ...(cc ? [`Cc: ${cc}`] : []),
    `Subject: ${message.subject?.trim() || "(no subject)"}`,
    "",
    textBody,
  ].join("\n");
}

function stripHtmlToText(html: string | null | undefined): string {
  if (!html) {
    return "";
  }

  return stripHtmlTags(html)
    .replace(/\s+/g, " ")
    .trim();
}
