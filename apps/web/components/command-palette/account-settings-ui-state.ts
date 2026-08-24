import type { SectionMessage } from "./account-settings-types";

export type SecurityForm =
  | "change-password"
  | "set-password"
  | "reset-encryption"
  | null;

export type SecurityUiState = {
  activeForm: SecurityForm;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  message: SectionMessage;
};

export type SecurityUiAction =
  | { type: "openForm"; form: NonNullable<SecurityForm> }
  | { type: "cancelForm" }
  | { type: "finishForm" }
  | {
      type: "setField";
      field: "currentPassword" | "newPassword" | "confirmPassword";
      value: string;
    }
  | { type: "setMessage"; message: SectionMessage }
  | { type: "resetFields" };

export const initialSecurityUiState: SecurityUiState = {
  activeForm: null,
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
  message: null,
};

export function securityUiReducer(
  state: SecurityUiState,
  action: SecurityUiAction,
): SecurityUiState {
  switch (action.type) {
    case "openForm":
      return {
        ...state,
        activeForm: action.form,
        message: null,
      };
    case "cancelForm":
      return {
        ...state,
        activeForm: null,
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
        message: null,
      };
    case "finishForm":
      return {
        ...state,
        activeForm: null,
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      };
    case "setField":
      return { ...state, [action.field]: action.value };
    case "setMessage":
      return { ...state, message: action.message };
    case "resetFields":
      return {
        ...state,
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      };
    default:
      return state;
  }
}

export type ProfileUiState = {
  showAvatarForm: boolean;
  avatarUrl: string;
  message: SectionMessage;
};

export type ProfileUiAction =
  | { type: "toggleAvatarForm"; imageUrl: string }
  | { type: "closeAvatarForm" }
  | { type: "setAvatarUrl"; value: string }
  | { type: "setMessage"; message: SectionMessage };

export function createInitialProfileUiState(imageUrl?: string | null): ProfileUiState {
  return {
    showAvatarForm: false,
    avatarUrl: imageUrl ?? "",
    message: null,
  };
}

export function profileUiReducer(
  state: ProfileUiState,
  action: ProfileUiAction,
): ProfileUiState {
  switch (action.type) {
    case "toggleAvatarForm":
      return {
        ...state,
        showAvatarForm: !state.showAvatarForm,
        avatarUrl: action.imageUrl,
        message: null,
      };
    case "closeAvatarForm":
      return { ...state, showAvatarForm: false, message: null };
    case "setAvatarUrl":
      return { ...state, avatarUrl: action.value };
    case "setMessage":
      return { ...state, message: action.message };
    default:
      return state;
  }
}

export type DangerZoneUiState = {
  showResetConfirm: boolean;
  showDeleteConfirm: boolean;
};

export type DangerZoneUiAction =
  | { type: "openResetConfirm" }
  | { type: "openDeleteConfirm" }
  | { type: "closeResetConfirm" }
  | { type: "closeDeleteConfirm" };

export const initialDangerZoneUiState: DangerZoneUiState = {
  showResetConfirm: false,
  showDeleteConfirm: false,
};

export function dangerZoneUiReducer(
  state: DangerZoneUiState,
  action: DangerZoneUiAction,
): DangerZoneUiState {
  switch (action.type) {
    case "openResetConfirm":
      return { showResetConfirm: true, showDeleteConfirm: false };
    case "openDeleteConfirm":
      return { showResetConfirm: false, showDeleteConfirm: true };
    case "closeResetConfirm":
      return { ...state, showResetConfirm: false };
    case "closeDeleteConfirm":
      return { ...state, showDeleteConfirm: false };
    default:
      return state;
  }
}
