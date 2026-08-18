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

export type EventOptionalSectionFields<TParticipant = never> = {
  location?: string;
  description?: string;
  recurrence?: string | null;
  reminder?: number | null;
  participants?: TParticipant[];
};

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
  TParticipant,
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
      ? { participants: [...CLEARED_EVENT_OPTIONAL_FIELDS.participants] }
      : {}),
  };
}
