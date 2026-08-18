export type EventOptionalSection =
  | "location"
  | "description"
  | "recurrence"
  | "notifications"
  | "participants";

export type EventOptionalSectionVisibility = {
  location?: boolean;
  description?: boolean;
  recurrence?: boolean;
  notifications?: boolean;
  participants?: boolean;
};

export type EventOptionalParticipant = {
  email?: string | null;
  role?: string;
};

function uniqueParticipantEmails(
  participants: readonly EventOptionalParticipant[] | null | undefined,
): Set<string> {
  const emails = new Set<string>();
  for (const participant of participants ?? []) {
    const email = participant.email?.trim().toLowerCase();
    if (email) {
      emails.add(email);
    }
  }
  return emails;
}

export type EventOptionalSectionFields<TParticipant = never> = {
  location?: string;
  description?: string;
  recurrence?: string | null;
  reminder?: number | null;
  participants?: TParticipant[];
};

export function hasOptionalEventParticipants(
  participants: readonly EventOptionalParticipant[] | null | undefined,
): boolean {
  const list = participants ?? [];
  const emails = uniqueParticipantEmails(list);
  if (emails.size > 0) {
    return emails.size > 1;
  }
  return list.length > 1;
}

export function organizerOnlyParticipants<T extends EventOptionalParticipant>(
  participants: readonly T[] | null | undefined,
): T[] {
  return (participants ?? []).filter(
    (participant) => participant.role === "organizer",
  );
}

export const CLEARED_EVENT_OPTIONAL_FIELDS = {
  location: "",
  description: "",
  recurrence: null,
  reminder: 0,
  participants: [] as const,
} as const;

export function clearedFieldsForDisabledEventSection(
  section: EventOptionalSection,
): Partial<{
  location: "";
  description: "";
  recurrence: null;
  reminder: 0;
  participants: [];
}> {
  switch (section) {
    case "location":
      return { location: "" };
    case "description":
      return { description: "" };
    case "recurrence":
      return { recurrence: null };
    case "notifications":
      return { reminder: 0 };
    case "participants":
      return { participants: [] };
  }
}

export function applyHiddenEventOptionalSections<
  TParticipant extends EventOptionalParticipant,
  TFields extends EventOptionalSectionFields<TParticipant>,
>(fields: TFields, visible: EventOptionalSectionVisibility): TFields {
  return {
    ...fields,
    ...(visible.location === false
      ? { location: CLEARED_EVENT_OPTIONAL_FIELDS.location }
      : {}),
    ...(visible.description === false
      ? { description: CLEARED_EVENT_OPTIONAL_FIELDS.description }
      : {}),
    ...(visible.recurrence === false
      ? { recurrence: CLEARED_EVENT_OPTIONAL_FIELDS.recurrence }
      : {}),
    ...(visible.notifications === false
      ? { reminder: CLEARED_EVENT_OPTIONAL_FIELDS.reminder }
      : {}),
    ...(visible.participants === false
      ? { participants: organizerOnlyParticipants(fields.participants) }
      : {}),
  };
}
