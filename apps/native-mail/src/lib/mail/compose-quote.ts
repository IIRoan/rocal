import {
  formatQuotedMailDate,
  resolveReplyRecipients,
  stripHtmlTags,
  type QuotedDateOptions,
} from "@workspace/calendar-core";
import { extractMessageBodies } from "./message-security";
import { limitMailQuoteContent } from "@workspace/calendar-core/mail-mime-limits";
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

function messageText(message: JmapEmailMessage, plaintext?: string): string {
  const rawBodies = extractMessageBodies(message);
  const bodies = limitMailQuoteContent({ text: plaintext ?? rawBodies.text, html: rawBodies.html });
  return bodies.text?.trim() || stripHtmlToText(bodies.html);
}

export function buildReplyBody(
  message: JmapEmailMessage,
  dateOptions: QuotedDateOptions,
  plaintext?: string,
): string {
  const sender =
    message.from?.[0]?.name?.trim() ||
    message.from?.[0]?.email?.trim() ||
    "Unknown sender";
  const receivedAt = formatQuotedMailDate(message.receivedAt, dateOptions);
  const source = messageText(message, plaintext);
  const quoted = `> ${source.replace(/\r?\n/g, "\n> ")}`;

  return `\n\nOn ${receivedAt}, ${sender} wrote:\n${quoted}`;
}

export function buildForwardBody(
  message: JmapEmailMessage,
  dateOptions: QuotedDateOptions,
  plaintext?: string,
): string {
  const textBody = messageText(message, plaintext);
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
