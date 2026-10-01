import {
  LIST_DENSITY_OPTIONS,
  MARK_AS_READ_DELAY_OPTIONS,
  UNDO_TOAST_DURATION_OPTIONS,
} from "@workspace/calendar-core";
import type { AccountSheetSearchEntry } from "@workspace/native-core/lib/account-sheet-model";

const COMPOSING = "Composing";
const DISPLAY = "Content & display";
const LIST = "Message list";

/** Settings inside the mail-only pages of the account drawer. */
export const MAIL_SETTINGS_SEARCH_ENTRIES: AccountSheetSearchEntry[] = [
  {
    pageId: "composing",
    label: "Auto-select reply identity",
    location: COMPOSING,
    keywords: "from address",
  },
  {
    pageId: "composing",
    label: "Plain text only",
    location: COMPOSING,
    keywords: "html format",
  },
  {
    pageId: "composing",
    label: "Signature position",
    location: `${COMPOSING} · Signature position`,
    keywords: "above below quote reply forward",
  },
  { pageId: "composing", label: "Signature separator", location: COMPOSING },
  {
    pageId: "composing",
    label: "Attachment reminder",
    location: COMPOSING,
    keywords: "keywords forgot",
  },
  {
    pageId: "mail-display",
    label: "Remote images",
    location: `${DISPLAY} · Remote images`,
    keywords: "ask block allow external content",
  },
  {
    pageId: "mail-display",
    label: "Trusted senders",
    location: `${DISPLAY} · Trusted senders`,
    keywords: "add allow",
  },
  {
    pageId: "mail-display",
    label: "Block tracking pixels",
    location: `${DISPLAY} · Privacy`,
    keywords: "trackers",
  },
  {
    pageId: "mail-display",
    label: "Email appearance",
    location: `${DISPLAY} · Email appearance`,
    keywords: "dark light original mode theme reader",
  },
  ...LIST_DENSITY_OPTIONS.map((option) => ({
    pageId: "mail-list",
    label: option.label,
    location: `${LIST} · Density`,
    keywords: "spacing",
  })),
  ...MARK_AS_READ_DELAY_OPTIONS.map((option) => ({
    pageId: "mail-list",
    label: option.label,
    location: `${LIST} · Mark as read`,
    keywords: "read opened",
  })),
  ...UNDO_TOAST_DURATION_OPTIONS.map((option) => ({
    pageId: "mail-list",
    label: option.label,
    location: `${LIST} · Undo window`,
    keywords: "toast",
  })),
  {
    pageId: "mail-list",
    label: "Expand threads in list",
    location: `${LIST} · Conversations`,
    keywords: "conversation",
  },
  {
    pageId: "mail-list",
    label: "Show label chips",
    location: `${LIST} · Conversations`,
    keywords: "labels tags",
  },
];
