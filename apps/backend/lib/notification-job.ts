import { ENCRYPTED_EVENT_PLACEHOLDER_TITLE } from "@workspace/calendar-core";

const ALLOWED_PAYLOAD_KEYS = new Set([
  "kind",
  "eventId",
  "minutesBefore",
  "inboundCount",
  "subject",
  "title",
  "fromName",
  "emailId",
]);

const MAX_EMAIL_ID_LENGTH = 128;

const MAX_DISPLAY_TITLE_LENGTH = 200;

export type NotificationJobKind = "event_reminder" | "new_mail";

export type NotificationJobPayload = {
  kind?: NotificationJobKind;
  eventId?: string;
  minutesBefore?: number;
  inboundCount?: number;
  subject?: string;
  title?: string;
  fromName?: string;
  emailId?: string;
};

export class NotificationJobPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotificationJobPayloadError";
  }
}

export function sanitizeNotificationJobPayload(
  input: Record<string, unknown>,
): NotificationJobPayload {
  const extraKeys = Object.keys(input).filter(
    (key) => !ALLOWED_PAYLOAD_KEYS.has(key),
  );

  if (extraKeys.length > 0) {
    throw new NotificationJobPayloadError(
      "Notification job payload contains disallowed fields.",
    );
  }

  const payload: NotificationJobPayload = {};

  if (input.kind !== undefined) {
    if (input.kind !== "event_reminder" && input.kind !== "new_mail") {
      throw new NotificationJobPayloadError("Invalid notification job kind.");
    }
    payload.kind = input.kind;
  }

  if (input.eventId !== undefined) {
    if (typeof input.eventId !== "string" || input.eventId.trim() === "") {
      throw new NotificationJobPayloadError("Invalid eventId.");
    }
    payload.eventId = input.eventId.trim();
  }

  if (input.minutesBefore !== undefined) {
    if (
      typeof input.minutesBefore !== "number" ||
      !Number.isInteger(input.minutesBefore) ||
      input.minutesBefore < 0
    ) {
      throw new NotificationJobPayloadError("Invalid minutesBefore.");
    }
    payload.minutesBefore = input.minutesBefore;
  }

  if (input.inboundCount !== undefined) {
    if (
      typeof input.inboundCount !== "number" ||
      !Number.isInteger(input.inboundCount) ||
      input.inboundCount < 1
    ) {
      throw new NotificationJobPayloadError("Invalid inboundCount.");
    }
    payload.inboundCount = input.inboundCount;
  }

  if (input.subject !== undefined) {
    const subject = sanitizeNotificationDisplayTitle(input.subject);
    if (!subject) {
      throw new NotificationJobPayloadError("Invalid subject.");
    }
    payload.subject = subject;
  }

  if (input.title !== undefined) {
    const title = sanitizeNotificationDisplayTitle(input.title);
    if (!title) {
      throw new NotificationJobPayloadError("Invalid title.");
    }
    payload.title = title;
  }

  if (input.fromName !== undefined) {
    const fromName = sanitizeNotificationDisplayTitle(input.fromName);
    if (!fromName) {
      throw new NotificationJobPayloadError("Invalid fromName.");
    }
    payload.fromName = fromName;
  }

  if (input.emailId !== undefined) {
    if (
      typeof input.emailId !== "string" ||
      input.emailId.trim() === "" ||
      input.emailId.trim().length > MAX_EMAIL_ID_LENGTH
    ) {
      throw new NotificationJobPayloadError("Invalid emailId.");
    }
    payload.emailId = input.emailId.trim();
  }

  if (
    payload.kind === "event_reminder" &&
    (payload.subject !== undefined ||
      payload.fromName !== undefined ||
      payload.emailId !== undefined)
  ) {
    throw new NotificationJobPayloadError(
      "Notification job payload contains disallowed fields.",
    );
  }

  if (
    payload.kind === "new_mail" &&
    (payload.eventId !== undefined || payload.title !== undefined)
  ) {
    throw new NotificationJobPayloadError(
      "Notification job payload contains disallowed fields.",
    );
  }

  return payload;
}

export function sanitizeNotificationDisplayTitle(
  value: unknown,
): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed || trimmed === ENCRYPTED_EVENT_PLACEHOLDER_TITLE) {
    return null;
  }
  if (trimmed.length <= MAX_DISPLAY_TITLE_LENGTH) {
    return trimmed;
  }
  return trimmed.slice(0, MAX_DISPLAY_TITLE_LENGTH).trimEnd();
}

export function firstNotificationDisplayTitle(
  ...values: unknown[]
): string | null {
  for (const value of values) {
    const sanitized = sanitizeNotificationDisplayTitle(value);
    if (sanitized) {
      return sanitized;
    }
  }
  return null;
}

export function eventReminderPayload(input: {
  eventId: string;
  minutesBefore: number;
  title?: string | null;
}): NotificationJobPayload {
  const payload: Record<string, unknown> = {
    kind: "event_reminder",
    eventId: input.eventId,
    minutesBefore: input.minutesBefore,
  };
  const title = sanitizeNotificationDisplayTitle(input.title);
  if (title) {
    payload.title = title;
  }
  return sanitizeNotificationJobPayload(payload);
}

export function newMailPayload(
  inboundCount: number,
  details?: {
    subject?: string | null;
    fromName?: string | null;
    emailId?: string | null;
  },
): NotificationJobPayload {
  const payload: Record<string, unknown> = {
    kind: "new_mail",
    inboundCount,
  };
  if (inboundCount === 1) {
    const subject = sanitizeNotificationDisplayTitle(details?.subject);
    if (subject) {
      payload.subject = subject;
    }
    const fromName = sanitizeNotificationDisplayTitle(details?.fromName);
    if (fromName) {
      payload.fromName = fromName;
    }
    const emailId = details?.emailId?.trim();
    if (emailId) {
      payload.emailId = emailId;
    }
  }
  return sanitizeNotificationJobPayload(payload);
}

export function shouldScheduleEventReminder(settings?: {
  emailNotifications?: boolean | null;
  pushNotifications?: boolean | null;
} | null): boolean {
  return (
    settings?.emailNotifications !== false ||
    settings?.pushNotifications !== false
  );
}
