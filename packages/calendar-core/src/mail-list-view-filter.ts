import { getZonedDayUtcBounds, resolveTimezone, utcToPickerDate } from "./timezone";

export type MailListViewFilter = "all" | "unread" | "read" | "attachments";

export const MAIL_LIST_VIEW_FILTERS: { value: MailListViewFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "read", label: "Read" },
  { value: "attachments", label: "Attachments" },
];

type FilterableMailMessage = {
  keywords?: Record<string, boolean>;
  hasAttachment?: boolean;
  attachments?: readonly unknown[];
};

export function applyMailListViewFilter<T extends FilterableMailMessage>(
  messages: T[],
  filter: MailListViewFilter,
  labelId: string | null,
): T[] {
  let next = messages;
  if (filter === "unread") {
    next = next.filter((message) => !message.keywords?.["$seen"]);
  } else if (filter === "read") {
    next = next.filter((message) => message.keywords?.["$seen"] === true);
  } else if (filter === "attachments") {
    next = next.filter(
      (message) =>
        message.hasAttachment === true || (message.attachments?.length ?? 0) > 0,
    );
  }
  if (labelId) {
    const key = `label:${labelId}`;
    next = next.filter((message) => message.keywords?.[key] === true);
  }
  return next;
}

export type MailListReadState = "all" | "unread" | "read";
export type MailListAge = "any" | "today" | "week" | "month" | "older";

export interface MailListFilters {
  readState: MailListReadState;
  starred: boolean;
  attachments: boolean;
  age: MailListAge;
  labelIds: string[];
}

export const DEFAULT_MAIL_LIST_FILTERS: MailListFilters = {
  readState: "all",
  starred: false,
  attachments: false,
  age: "any",
  labelIds: [],
};

export const MAIL_LIST_READ_STATES: { value: MailListReadState; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "read", label: "Read" },
];

export const MAIL_LIST_AGES: { value: MailListAge; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "today", label: "Today" },
  { value: "week", label: "Last 7 days" },
  { value: "month", label: "Last 30 days" },
  { value: "older", label: "Older than 30 days" },
];

type DatedFilterableMailMessage = FilterableMailMessage & {
  receivedAt?: string;
};

export function countActiveMailListFilters(filters: MailListFilters): number {
  return (
    (filters.readState !== "all" ? 1 : 0) +
    (filters.starred ? 1 : 0) +
    (filters.attachments ? 1 : 0) +
    (filters.age !== "any" ? 1 : 0) +
    filters.labelIds.length
  );
}

function zonedDayStartUtc(now: Date, daysAgo: number, timezone: string): number {
  const today = utcToPickerDate(now, timezone);
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo);
  return getZonedDayUtcBounds(day, timezone).start.getTime();
}

function ageMatcher(
  age: MailListAge,
  now: Date,
  timezone: string,
): ((receivedAtMs: number) => boolean) | null {
  if (age === "any") return null;
  if (age === "older") {
    const cutoff = zonedDayStartUtc(now, 29, timezone);
    return (receivedAtMs) => receivedAtMs < cutoff;
  }
  const daysAgo = age === "today" ? 0 : age === "week" ? 6 : 29;
  const cutoff = zonedDayStartUtc(now, daysAgo, timezone);
  return (receivedAtMs) => receivedAtMs >= cutoff;
}

/** Combines read state, star, attachment, age (zoned to the user's day), and any-of label filters. */
export function applyMailListFilters<T extends DatedFilterableMailMessage>(
  messages: T[],
  filters: MailListFilters,
  options: { now: Date; timezone?: string | null },
): T[] {
  if (countActiveMailListFilters(filters) === 0) return messages;
  const timezone = resolveTimezone(options.timezone);
  const matchesAge = ageMatcher(filters.age, options.now, timezone);
  const labelKeys = filters.labelIds.map((id) => `label:${id}`);

  return messages.filter((message) => {
    const keywords = message.keywords;
    if (filters.readState === "unread" && keywords?.["$seen"]) return false;
    if (filters.readState === "read" && keywords?.["$seen"] !== true) return false;
    if (filters.starred && keywords?.["$flagged"] !== true) return false;
    if (
      filters.attachments &&
      message.hasAttachment !== true &&
      (message.attachments?.length ?? 0) === 0
    ) {
      return false;
    }
    if (matchesAge) {
      const receivedAtMs = message.receivedAt ? Date.parse(message.receivedAt) : Number.NaN;
      if (Number.isNaN(receivedAtMs) || !matchesAge(receivedAtMs)) return false;
    }
    if (labelKeys.length > 0 && !labelKeys.some((key) => keywords?.[key] === true)) {
      return false;
    }
    return true;
  });
}
