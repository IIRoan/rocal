import { WEEKDAY_OPTIONS } from "@workspace/native-core/lib/settings-options";
import type { AccountSheetSearchEntry } from "@workspace/native-core/lib/account-sheet-model";
import { VIEW_OPTIONS } from "./calendar-view-options";

/** Settings inside the calendar-only pages of the account drawer. */
export const CALENDAR_SETTINGS_SEARCH_ENTRIES: AccountSheetSearchEntry[] = [
  ...VIEW_OPTIONS.map((option) => ({
    pageId: "appearance",
    label: option.label,
    location: "Appearance · Default view",
    keywords: "calendar layout",
  })),
  {
    pageId: "calendar",
    label: "Default calendar",
    location: "Calendar settings · Default calendar",
  },
  {
    pageId: "calendar",
    label: "Week starts on",
    location: "Calendar settings · Week starts on",
    keywords: "sunday monday first day",
  },
  {
    pageId: "calendar",
    label: "Working days",
    location: "Calendar settings · Working days",
    keywords: "weekdays",
  },
  ...WEEKDAY_OPTIONS.map((day) => ({
    pageId: "calendar",
    label: day.label,
    location: "Calendar settings · Working days",
    keywords: "work week",
  })),
];
