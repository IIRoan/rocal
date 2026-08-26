import { z } from "zod";
import { sanitizeNotificationDisplayTitle } from "./notification-job";

export const STALWART_MAIL_INGEST_EVENT = "message-ingest.ham" as const;

const stalwartIdSchema = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => value.length > 0, "Expected a non-empty id");

const webhookFromSchema = z.union([
  z.string(),
  z.array(
    z.object({
      email: z.string(),
      name: z.string().nullable().optional(),
    }),
  ),
]);

const webhookAddressListSchema = z.union([
  z.string(),
  z.array(z.string()),
  z.array(
    z.object({
      email: z.string(),
      name: z.string().nullable().optional(),
    }),
  ),
]);

function parseRecipientEmails(
  to: z.infer<typeof webhookAddressListSchema> | undefined,
): string[] {
  if (!to) {
    return [];
  }

  if (typeof to === "string") {
    const trimmed = to.trim();
    return trimmed ? [trimmed.toLowerCase()] : [];
  }

  return to.flatMap((entry) => {
    if (typeof entry === "string") {
      const trimmed = entry.trim();
      return trimmed ? [trimmed.toLowerCase()] : [];
    }

    const email = entry.email?.trim().toLowerCase();
    return email ? [email] : [];
  });
}

const messageIngestDataSchema = z
  .object({
    accountId: stalwartIdSchema,
    documentId: stalwartIdSchema.optional(),
    from: webhookFromSchema.optional(),
    to: webhookAddressListSchema.optional(),
    subject: z.string().nullable().optional(),
    messageId: z.string().nullable().optional(),
  })
  .passthrough();

const webhookEventSchema = z.object({
  id: z.string().optional(),
  createdAt: z.string().optional(),
  type: z.string(),
  data: z.unknown().optional(),
});

export const stalwartWebhookPayloadSchema = z.object({
  events: z.array(webhookEventSchema).default([]),
});

export type StalwartWebhookPayload = z.infer<typeof stalwartWebhookPayloadSchema>;

export type StalwartMailIngestEvent = {
  accountId: string;
  documentId: string;
  recipientEmails: string[];
  messageId: string | null;
  subject: string | null;
  fromName: string | null;
  fromEmail: string | null;
};

function extractMessageId(data: Record<string, unknown>): string | null {
  const candidates = [
    data.messageId,
    data.message_id,
    data["message-id"],
    data["Message-Id"],
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function parseFromEmail(from: z.infer<typeof webhookFromSchema> | undefined) {
  if (typeof from === "string") {
    const trimmed = from.trim();
    const emailMatch = trimmed.match(/<([^>]+)>/);
    const email = (emailMatch?.[1] ?? trimmed).trim().toLowerCase();
    return email.includes("@") ? email : null;
  }

  const email = from?.[0]?.email?.trim().toLowerCase();
  return email && email.includes("@") ? email : null;
}

function parseFromDisplay(from: z.infer<typeof webhookFromSchema> | undefined) {
  if (typeof from === "string") {
    const trimmed = from.trim();
    const displayMatch = trimmed.match(/^(.+?)\s*<[^>]+>$/);
    const candidate = displayMatch?.[1]?.trim() || trimmed;
    return sanitizeNotificationDisplayTitle(candidate);
  }

  const first = from?.[0];
  if (!first) {
    return null;
  }

  return (
    sanitizeNotificationDisplayTitle(first.name) ??
    sanitizeNotificationDisplayTitle(first.email)
  );
}

export function parseStalwartMailIngestEvents(
  payload: StalwartWebhookPayload,
): StalwartMailIngestEvent[] {
  const events: StalwartMailIngestEvent[] = [];

  for (const event of payload.events) {
    if (event.type !== STALWART_MAIL_INGEST_EVENT) {
      continue;
    }

    const parsed = messageIngestDataSchema.safeParse(event.data ?? {});
    if (!parsed.success || !parsed.data.documentId) {
      continue;
    }

    events.push({
      accountId: parsed.data.accountId,
      documentId: parsed.data.documentId,
      recipientEmails: parseRecipientEmails(parsed.data.to),
      messageId:
        parsed.data.messageId?.trim() ||
        extractMessageId(parsed.data as Record<string, unknown>),
      subject: sanitizeNotificationDisplayTitle(parsed.data.subject),
      fromName: parseFromDisplay(parsed.data.from),
      fromEmail: parseFromEmail(parsed.data.from),
    });
  }

  return events;
}
