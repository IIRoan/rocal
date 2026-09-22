import type { MailSearchFilters } from "@/lib/mail/mail-search-filter";
import type { MailListViewFilter } from "@workspace/calendar-core";

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

export {
  applyMailListViewFilter,
  MAIL_LIST_VIEW_FILTERS,
  type MailListViewFilter,
} from "@workspace/calendar-core";
