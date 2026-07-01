import type { MailSearchFilters } from "@/lib/mail/mail-search-filter";

export type MailAppListChromeState = {
  paletteInitialView?: string;
  mailListSearch: string;
  debouncedMailListSearch: string;
  advancedFilters: MailSearchFilters;
  filterPanelExpanded: boolean;
  emptyFolderOpen: boolean;
};

export const initialMailAppListChromeState: MailAppListChromeState = {
  paletteInitialView: undefined,
  mailListSearch: "",
  debouncedMailListSearch: "",
  advancedFilters: { text: undefined, conditions: [] },
  filterPanelExpanded: false,
  emptyFolderOpen: false,
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
        advancedFilters: { text: undefined, conditions: [] },
        filterPanelExpanded: false,
      };
    default:
      return state;
  }
}
