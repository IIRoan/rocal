export type MailPaletteView =
  | "main"
  | "account"
  | "appearance"
  | "time-region"
  | "timezone"
  | "notifications"
  | "security"
  | "passkeys"
  | "mailboxes"
  | "mailbox-create"
  | "mailbox-edit"
  | "invites"
  | "labels"
  | "composing"
  | "mail-display"
  | "mail-list"
  | "contacts"
  | "mail-settings";

export type MailPaletteChromeState = {
  navHistory: MailPaletteView[];
  query: string;
  debouncedSearchQuery: string;
  selectedIndex: number;
  passkeyAddMode: boolean;
};

export type MailPaletteChromeAction =
  | { type: "reset"; view: MailPaletteView }
  | { type: "goForward"; view: MailPaletteView; passkeyAddMode?: boolean }
  | { type: "goBack" }
  | { type: "setQuery"; query: string }
  | { type: "setDebouncedSearchQuery"; query: string }
  | { type: "setSelectedIndex"; index: number }
  | { type: "moveSelection"; delta: number; maxIndex: number }
  | { type: "setPasskeyAddMode"; enabled: boolean };

export function createInitialMailChromeState(
  view: MailPaletteView = "main",
): MailPaletteChromeState {
  return {
    navHistory: [view],
    query: "",
    debouncedSearchQuery: "",
    selectedIndex: 0,
    passkeyAddMode: false,
  };
}

export function mailPaletteChromeReducer(
  state: MailPaletteChromeState,
  action: MailPaletteChromeAction,
): MailPaletteChromeState {
  switch (action.type) {
    case "reset":
      return createInitialMailChromeState(action.view);
    case "goForward":
      return {
        ...state,
        query: "",
        debouncedSearchQuery: "",
        selectedIndex: 0,
        passkeyAddMode: action.passkeyAddMode ?? state.passkeyAddMode,
        navHistory: [...state.navHistory, action.view],
      };
    case "goBack":
      return {
        ...state,
        query: "",
        debouncedSearchQuery: "",
        selectedIndex: 0,
        passkeyAddMode: false,
        navHistory:
          state.navHistory.length > 1 ? state.navHistory.slice(0, -1) : ["main"],
      };
    case "setQuery":
      return { ...state, query: action.query, selectedIndex: 0 };
    case "setDebouncedSearchQuery":
      return { ...state, debouncedSearchQuery: action.query };
    case "setSelectedIndex":
      return { ...state, selectedIndex: action.index };
    case "moveSelection":
      return {
        ...state,
        selectedIndex: Math.min(
          Math.max(state.selectedIndex + action.delta, 0),
          Math.max(action.maxIndex, 0),
        ),
      };
    case "setPasskeyAddMode":
      return { ...state, passkeyAddMode: action.enabled };
    default:
      return state;
  }
}
