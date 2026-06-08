import type {
  EventEncryptionMode,
} from "@workspace/calendar-core";
import type { PrismaClient } from "../generated/prisma/index.js";
import type { RowEncryptionState } from "./encryption-state";

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
