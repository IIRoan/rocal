import type { PaletteView } from "./constants";
import { buildInitialHistory } from "./command-palette-nav";

export type PaletteChromeState = {
  navHistory: PaletteView[];
  searchQuery: string;
  passkeyAddMode: boolean;
  subscriptionEditCalendarId: string | undefined;
};

export type PaletteChromeAction =
  | { type: "resetHistory"; view: PaletteView }
  | { type: "goForward"; view: PaletteView; preservePasskeyAddMode?: boolean }
  | { type: "goBack" }
  | { type: "showMain" }
  | { type: "setSearchQuery"; query: string }
  | { type: "setPasskeyAddMode"; enabled: boolean }
  | { type: "setSubscriptionEditCalendarId"; calendarId: string | undefined };

export function createInitialChromeState(
  initialView: PaletteView,
  initialSearchQuery = "",
): PaletteChromeState {
  return {
    navHistory: buildInitialHistory(initialView),
    searchQuery: initialSearchQuery,
    passkeyAddMode: false,
    subscriptionEditCalendarId: undefined,
  };
}

export function paletteChromeReducer(
  state: PaletteChromeState,
  action: PaletteChromeAction,
): PaletteChromeState {
  switch (action.type) {
    case "resetHistory":
      return {
        ...state,
        navHistory: buildInitialHistory(action.view),
        searchQuery: "",
        passkeyAddMode: false,
      };
    case "goForward":
      return {
        ...state,
        searchQuery: "",
        passkeyAddMode: action.preservePasskeyAddMode
          ? state.passkeyAddMode
          : false,
        navHistory: [...state.navHistory, action.view],
      };
    case "goBack":
      return {
        ...state,
        searchQuery: "",
        passkeyAddMode: false,
        navHistory:
          state.navHistory.length > 1
            ? state.navHistory.slice(0, -1)
            : ["main"],
      };
    case "showMain":
      return { ...state, navHistory: ["main"] };
    case "setSearchQuery":
      return { ...state, searchQuery: action.query };
    case "setPasskeyAddMode":
      return { ...state, passkeyAddMode: action.enabled };
    case "setSubscriptionEditCalendarId":
      return { ...state, subscriptionEditCalendarId: action.calendarId };
    default:
      return state;
  }
}

export type PaletteBusyState = {
  saving: boolean;
  deletingAccount: boolean;
  changingPassword: boolean;
  settingPassword: boolean;
  resettingEncryptionPassword: boolean;
  updatingProfile: boolean;
  localImageOverride: string | null | undefined;
};

export type PaletteBusyAction =
  | { type: "setSaving"; value: boolean }
  | { type: "setDeletingAccount"; value: boolean }
  | { type: "setChangingPassword"; value: boolean }
  | { type: "setSettingPassword"; value: boolean }
  | { type: "setResettingEncryptionPassword"; value: boolean }
  | { type: "setUpdatingProfile"; value: boolean }
  | { type: "setLocalImageOverride"; value: string | null };

export const initialBusyState: PaletteBusyState = {
  saving: false,
  deletingAccount: false,
  changingPassword: false,
  settingPassword: false,
  resettingEncryptionPassword: false,
  updatingProfile: false,
  localImageOverride: undefined,
};

export function paletteBusyReducer(
  state: PaletteBusyState,
  action: PaletteBusyAction,
): PaletteBusyState {
  switch (action.type) {
    case "setSaving":
      return { ...state, saving: action.value };
    case "setDeletingAccount":
      return { ...state, deletingAccount: action.value };
    case "setChangingPassword":
      return { ...state, changingPassword: action.value };
    case "setSettingPassword":
      return { ...state, settingPassword: action.value };
    case "setResettingEncryptionPassword":
      return { ...state, resettingEncryptionPassword: action.value };
    case "setUpdatingProfile":
      return { ...state, updatingProfile: action.value };
    case "setLocalImageOverride":
      return { ...state, localImageOverride: action.value };
    default:
      return state;
  }
}
