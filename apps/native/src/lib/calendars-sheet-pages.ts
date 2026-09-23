export const CALENDARS_ROOT_PAGE = "calendars";
export const CALENDAR_CREATE_PAGE = "calendar-create";
export const SUBSCRIPTION_CREATE_PAGE = "subscription-create";

const CALENDAR_EDIT_PREFIX = "calendar-edit:";
const SUBSCRIPTION_EDIT_PREFIX = "subscription-edit:";

export function calendarEditPage(calendarId: string): string {
  return `${CALENDAR_EDIT_PREFIX}${calendarId}`;
}

export function subscriptionEditPage(subscriptionId: string): string {
  return `${SUBSCRIPTION_EDIT_PREFIX}${subscriptionId}`;
}

export type CalendarsSheetPage =
  | { kind: "root" }
  | { kind: "calendar-create" }
  | { kind: "calendar-edit"; id: string }
  | { kind: "subscription-create" }
  | { kind: "subscription-edit"; id: string };

/** Maps a page-stack key to the calendars drawer page it renders; unknown keys fall back to the root list. */
export function parseCalendarsSheetPage(page: string): CalendarsSheetPage {
  if (page === CALENDAR_CREATE_PAGE) return { kind: "calendar-create" };
  if (page === SUBSCRIPTION_CREATE_PAGE) return { kind: "subscription-create" };
  if (page.startsWith(CALENDAR_EDIT_PREFIX) && page.length > CALENDAR_EDIT_PREFIX.length) {
    return { kind: "calendar-edit", id: page.slice(CALENDAR_EDIT_PREFIX.length) };
  }
  if (
    page.startsWith(SUBSCRIPTION_EDIT_PREFIX) &&
    page.length > SUBSCRIPTION_EDIT_PREFIX.length
  ) {
    return { kind: "subscription-edit", id: page.slice(SUBSCRIPTION_EDIT_PREFIX.length) };
  }
  return { kind: "root" };
}

/** True when a page-stack key belongs to the calendars drawer, so other drawers can host its pages. */
export function isCalendarsSheetPage(page: string): boolean {
  return page === CALENDARS_ROOT_PAGE || parseCalendarsSheetPage(page).kind !== "root";
}
