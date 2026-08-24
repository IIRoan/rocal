import type { Prisma } from "../generated/prisma/index.js";
import {
  type EventParticipant,
  type EventParticipantInput,
  type EventParticipantRole,
  type EventParticipantStatus,
  buildSolaceProfileAvatarPath,
  normalizeParticipantEmail,
  sanitizePublicImageUrl,
} from "@workspace/calendar-core";
export { normalizeParticipantEmail } from "@workspace/calendar-core";

export const EVENT_PARTICIPANT_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  image: true,
} as const;

export const EVENT_PARTICIPANT_INCLUDE = {
  participants: {
    include: {
      user: {
        select: EVENT_PARTICIPANT_USER_SELECT,
      },
    },
  },
} as const;

/** Standard include for calendar events with category, calendar, and participants. */
export const EVENT_WITH_RELATIONS_INCLUDE = {
  category: true,
  calendar: true,
  ...EVENT_PARTICIPANT_INCLUDE,
} as const;

/** Like EVENT_WITH_RELATIONS_INCLUDE but also loads recurrence exceptions. */
export const EVENT_WITH_RECURRENCE_INCLUDE = {
  ...EVENT_WITH_RELATIONS_INCLUDE,
  recurrenceExceptions: true,
} as const;

export type EventParticipantRecord = Prisma.EventParticipantGetPayload<{
  include: {
    user: {
      select: typeof EVENT_PARTICIPANT_USER_SELECT;
    };
  };
}>;

const ROLE_RANK: Record<EventParticipantRole, number> = {
  organizer: 0,
  attendee: 1,
};

const STATUS_SET = new Set<EventParticipantStatus>([
  "pending",
  "accepted",
  "declined",
  "tentative",
]);

export function normalizeParticipantRole(
  role: string | null | undefined,
): EventParticipantRole {
  return role === "organizer" ? "organizer" : "attendee";
}

export function normalizeParticipantStatus(
  status: string | null | undefined,
  role: EventParticipantRole,
): EventParticipantStatus {
  if (STATUS_SET.has(status as EventParticipantStatus)) {
    return status as EventParticipantStatus;
  }

  return role === "organizer" ? "accepted" : "pending";
}

export function mergeParticipantInput(
  existing: EventParticipantInput | undefined,
  next: EventParticipantInput,
): EventParticipantInput {
  if (!existing) {
    return next;
  }

  const role =
    existing.role === "organizer" || next.role === "organizer"
      ? "organizer"
      : "attendee";
  const status =
    role === "organizer"
      ? "accepted"
      : (next.status ?? existing.status ?? "pending");

  return {
    ...existing,
    ...next,
    displayName: next.displayName?.trim() || existing.displayName?.trim(),
    role,
    status,
  };
}

export function resolveParticipantInputs(input: {
  owner?:
    | {
        email: string;
        name?: string | null;
      }
    | null
    | undefined;
  participants?: EventParticipantInput[] | null | undefined;
}): EventParticipantInput[] {
  const ownerEmail = normalizeParticipantEmail(input.owner?.email);
  const deduped = new Map<string, EventParticipantInput>();

  if (ownerEmail) {
    deduped.set(ownerEmail, {
      email: ownerEmail,
      displayName: input.owner?.name?.trim() || ownerEmail,
      role: "organizer",
      status: "accepted",
    });
  }

  for (const participant of input.participants ?? []) {
    const email = normalizeParticipantEmail(participant.email);
    if (!email) {
      continue;
    }

    const role =
      ownerEmail && email === ownerEmail
        ? "organizer"
        : normalizeParticipantRole(participant.role);
    const status = normalizeParticipantStatus(participant.status, role);

    deduped.set(
      email,
      mergeParticipantInput(deduped.get(email), {
        email,
        displayName: participant.displayName?.trim() || undefined,
        role,
        status,
      }),
    );
  }

  return [...deduped.values()];
}

export function mapEventParticipant(
  participant: EventParticipantRecord,
): EventParticipant {
  const email =
    normalizeParticipantEmail(participant.email) ||
    normalizeParticipantEmail(participant.user?.email) ||
    "";
  const role = normalizeParticipantRole(participant.role);

  return {
    id: participant.id,
    eventId: participant.eventId,
    userId: participant.userId,
    email,
    displayName:
      participant.displayName ?? participant.user?.name?.trim() ?? email,
    image: sanitizePublicImageUrl(participant.user?.image)
      ? buildSolaceProfileAvatarPath(email)
      : null,
    role,
    status: normalizeParticipantStatus(participant.status, role),
    createdAt: participant.createdAt,
    updatedAt: participant.updatedAt,
  };
}

export function sortEventParticipants(participants: EventParticipant[]) {
  return [...participants].sort((left, right) => {
    const roleDiff = ROLE_RANK[left.role] - ROLE_RANK[right.role];
    if (roleDiff !== 0) {
      return roleDiff;
    }

    const leftLabel =
      left.displayName?.trim() || left.email.trim() || left.id.trim();
    const rightLabel =
      right.displayName?.trim() || right.email.trim() || right.id.trim();

    return leftLabel.localeCompare(rightLabel, undefined, {
      sensitivity: "base",
    });
  });
}

/**
 * Map and sort participants on any event-shaped object.
 * Replaces the repeated `sortEventParticipants((event.participants ?? []).map(...))` pattern.
 */
export function mapAndSortParticipants(
  event: { participants?: EventParticipantRecord[] | null },
): EventParticipant[] {
  return sortEventParticipants(
    (event.participants ?? []).map((p) => mapEventParticipant(p)),
  );
}
