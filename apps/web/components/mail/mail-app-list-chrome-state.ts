import type { MailSearchFilters } from "@/lib/mail/mail-search-filter";
import type { JmapEmailMessage } from "@/lib/mail/types";

export type MailListViewFilter = "all" | "unread" | "read" | "attachments";

export const MAIL_LIST_VIEW_FILTERS: { value: MailListViewFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "read", label: "Read" },
  { value: "attachments", label: "Attachments" },
];

export type MailAppListChromeState = {
  paletteInitialView?: string;
  mailListSearch: string;
  debouncedMailListSearch: string;
  advancedFilters: MailSearchFilters;
  filterPanelExpanded: boolean;
  emptyFolderOpen: boolean;
  searchBarOpen: boolean;
  listViewFilter: MailListViewFilter;
  activeLabelId: string | null;
};

export const initialMailAppListChromeState: MailAppListChromeState = {
  paletteInitialView: undefined,
  mailListSearch: "",
  debouncedMailListSearch: "",
  advancedFilters: { text: undefined, conditions: [] },
  filterPanelExpanded: false,
  emptyFolderOpen: false,
  searchBarOpen: false,
  listViewFilter: "all",
  activeLabelId: null,
};

export type MailAppListChromeAction =
  | { type: "patch"; patch: Partial<MailAppListChromeState> }
  | { type: "resetMailboxFilters" };

export function mailAppListChromeReducer(
  state: MailAppListChromeState,
  action: MailAppListChromeAction,
): MailAppListChromeState {
  switch (action.type) {
    case "patch":
      return { ...state, ...action.patch };
    case "resetMailboxFilters":
      return {
        ...state,
        mailListSearch: "",
        debouncedMailListSearch: "",
        advancedFilters: { text: undefined, conditions: [] },
        filterPanelExpanded: false,
        searchBarOpen: false,
        listViewFilter: "all",
        activeLabelId: null,
      };
    default:
      return state;
  }
}

export function applyMailListViewFilter(
  messages: JmapEmailMessage[],
  filter: MailListViewFilter,
  labelId: string | null,
): JmapEmailMessage[] {
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
