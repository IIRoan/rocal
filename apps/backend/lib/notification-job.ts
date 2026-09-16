/** The outbox payload holds opaque references only; the iOS NSE resolves content on-device. */
const ALLOWED_PAYLOAD_KEYS = new Set([
  "kind",
  "eventId",
  "minutesBefore",
  "inboundCount",
  "emailId",
  "accountId",
]);

const MAX_OPAQUE_ID_LENGTH = 128;

export type NotificationJobKind = "event_reminder" | "new_mail";

export type NotificationJobPayload = {
  kind?: NotificationJobKind;
  eventId?: string;
  minutesBefore?: number;
  inboundCount?: number;
  emailId?: string;
  accountId?: string;
};

export class NotificationJobPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotificationJobPayloadError";
  }
}

function opaqueId(value: unknown, field: string): string {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value.trim().length > MAX_OPAQUE_ID_LENGTH
  ) {
    throw new NotificationJobPayloadError(`Invalid ${field}.`);
  }
  return value.trim();
}

function positiveInteger(value: unknown, field: string, min: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min) {
    throw new NotificationJobPayloadError(`Invalid ${field}.`);
  }
  return value;
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
    payload.eventId = opaqueId(input.eventId, "eventId");
  }

  if (input.minutesBefore !== undefined) {
    payload.minutesBefore = positiveInteger(
      input.minutesBefore,
      "minutesBefore",
      0,
    );
  }

  if (input.inboundCount !== undefined) {
    payload.inboundCount = positiveInteger(
      input.inboundCount,
      "inboundCount",
      1,
    );
  }

  if (input.emailId !== undefined) {
    payload.emailId = opaqueId(input.emailId, "emailId");
  }

  if (input.accountId !== undefined) {
    payload.accountId = opaqueId(input.accountId, "accountId");
  }

  if (
    payload.kind === "event_reminder" &&
    (payload.emailId !== undefined || payload.accountId !== undefined)
  ) {
    throw new NotificationJobPayloadError(
      "Notification job payload contains disallowed fields.",
    );
  }

  if (payload.kind === "new_mail" && payload.eventId !== undefined) {
    throw new NotificationJobPayloadError(
      "Notification job payload contains disallowed fields.",
    );
  }

  return payload;
}

export function eventReminderPayload(input: {
  eventId: string;
  minutesBefore: number;
}): NotificationJobPayload {
  return sanitizeNotificationJobPayload({
    kind: "event_reminder",
    eventId: input.eventId,
    minutesBefore: input.minutesBefore,
  });
}

export function newMailPayload(
  inboundCount: number,
  refs?: {
    emailId?: string | null;
    accountId?: string | null;
  },
): NotificationJobPayload {
  const payload: Record<string, unknown> = {
    kind: "new_mail",
    inboundCount,
  };
  const emailId = refs?.emailId?.trim();
  if (emailId) {
    payload.emailId = emailId;
  }
  const accountId = refs?.accountId?.trim();
  if (accountId) {
    payload.accountId = accountId;
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
