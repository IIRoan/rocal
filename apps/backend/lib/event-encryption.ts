import {
  PLAINTEXT_EVENT_CONTENT_WITH_CIPHERTEXT_MESSAGE,
  findPlaintextEventContentFields,
  hasEncryptedPayloadValue,
  type EventContentField,
  type EventEncryptionMode,
  type EventInvitationContent,
} from "@workspace/calendar-core";
import type { PrismaClient } from "../generated/prisma/index.js";
import type { RowEncryptionState } from "./encryption-state";
import { ValidationError } from "./errors";

export type ResolvedEventPersistencePolicy = {
  encryptionState: RowEncryptionState;
  title: string;
  description: string | null;
  location: string | null;
};

type EventReencryptionBackfillInput = {
  userId: string;
  calendarId?: string;
  calendarIds?: string[];
  now?: Date;
};

type ResolveEventPersistencePolicyInput = {
  hasEncryptedPayload: boolean;
  title: string;
  description?: string | null;
  location?: string | null;
};

function normalizeOptionalText(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeEventEncryptionMode(
  value?: string | null,
): EventEncryptionMode {
  void value;
  return "full";
}

export function isEventFullyEncrypted(
  encryptionState?: string | null,
): boolean {
  return encryptionState === "encrypted";
}

export function resolveEventPersistencePolicy(
  input: ResolveEventPersistencePolicyInput,
): ResolvedEventPersistencePolicy {
  const title = input.title.trim();
  const description = normalizeOptionalText(input.description);
  const location = normalizeOptionalText(input.location);

  if (!input.hasEncryptedPayload) {
    return {
      encryptionState: "plaintext",
      title,
      description,
      location,
    };
  }

  return {
    encryptionState: "encrypted",
    title: "",
    description: null,
    location: null,
  };
}

/**
 * Service-level guard matching the route contract: ciphertext requests must not
 * also carry plaintext title/description/location.
 */
export function assertNoPlaintextEventContentWithCiphertext(
  input: Partial<Record<EventContentField, string | null>> & {
    encryptedContent?: string | null;
  },
): void {
  if (!hasEncryptedPayloadValue(input.encryptedContent)) {
    return;
  }

  const [field] = findPlaintextEventContentFields(input);
  if (field) {
    throw new ValidationError(
      PLAINTEXT_EVENT_CONTENT_WITH_CIPHERTEXT_MESSAGE,
      field,
    );
  }
}

type InvitationContentSource = {
  title: string;
  description: string | null;
  location: string | null;
};

/**
 * Content for outgoing invitation mail. Encrypted events only use the
 * transient `invitationContent` a client sent for this request; it is never
 * persisted. Plaintext events use their stored fields.
 */
export function resolveInvitationContent(input: {
  hasEncryptedPayload: boolean;
  invitationContent?: EventInvitationContent;
  title?: string | null;
  description?: string | null;
  location?: string | null;
}): InvitationContentSource | null {
  if (input.invitationContent) {
    return {
      title: input.invitationContent.title.trim(),
      description: normalizeOptionalText(input.invitationContent.description),
      location: normalizeOptionalText(input.invitationContent.location),
    };
  }

  const title = input.title?.trim();
  if (input.hasEncryptedPayload || !title) {
    return null;
  }

  return {
    title,
    description: normalizeOptionalText(input.description),
    location: normalizeOptionalText(input.location),
  };
}

export async function backfillEncryptedEventsToCiphertextOnly(
  prisma: Pick<PrismaClient, "calendarEvent">,
  input: EventReencryptionBackfillInput,
): Promise<number> {
  const {
    userId,
    calendarId,
    calendarIds,
    now = new Date(),
  } = input;

  const targetCalendarIds: string[] = Array.from(
    new Set([...(calendarIds ?? []), ...(calendarId ? [calendarId] : [])]),
  ).filter((value): value is string => Boolean(value));

  if (targetCalendarIds.length === 0) {
    return 0;
  }

  let calendarScope: string | { in: string[] };

  if (targetCalendarIds.length === 1) {
    const [singleCalendarId] = targetCalendarIds;

    if (!singleCalendarId) {
      return 0;
    }

    calendarScope = singleCalendarId;
  } else {
    calendarScope = { in: targetCalendarIds };
  }

  const result = await prisma.calendarEvent.updateMany({
    where: {
      userId,
      calendarId: calendarScope,
      encryptedContent: { not: null },
      encryptionState: { not: "encrypted" },
    },
    data: {
      title: "",
      description: null,
      location: null,
      encryptionState: "encrypted",
      updatedAt: now,
    },
  });

  return result.count;
}
