export type AuthMode = "sign-in" | "sign-up" | "forgot-password";

export type LoginFormFieldsState = {
  authMode: AuthMode;
  name: string;
  email: string;
  desiredEmail: string;
  password: string;
  inviteToken: string;
  showPassword: boolean;
  signupDomain: string;
};

export type LoginFormChromeState = {
  passkeyLoading: boolean;
  emailLoading: boolean;
  error: string | null;
  notice: string | null;
};

export type EmailAvailabilityValue =
  | null
  | { available: true }
  | { available: false; message: string };

export type EmailAvailabilityUiState = {
  availability: EmailAvailabilityValue;
  checking: boolean;
};

export type InviteValidationValue =
  | null
  | { valid: true; inviterName?: string | null }
  | { valid: false; reason: string };

export type InviteValidationUiState = {
  validation: InviteValidationValue;
  validating: boolean;
};

export function createInitialLoginFormFields(
  inviteToken: string | null,
  signupDomain: string,
): LoginFormFieldsState {
  return {
    authMode: inviteToken ? "sign-up" : "sign-in",
    name: "",
    email: "",
    desiredEmail: "",
    password: "",
    inviteToken: inviteToken?.trim() ?? "",
    showPassword: false,
    signupDomain,
  };
}

export const initialLoginFormChrome: LoginFormChromeState = {
  passkeyLoading: false,
  emailLoading: false,
  error: null,
  notice: null,
};

export const initialEmailAvailabilityUi: EmailAvailabilityUiState = {
  availability: null,
  checking: false,
};

export const initialInviteValidationUi: InviteValidationUiState = {
  validation: null,
  validating: false,
};

export type LoginFormFieldsAction =
  | { type: "switch-mode"; mode: AuthMode }
  | { type: "set-name"; name: string }
  | { type: "set-email"; email: string }
  | { type: "set-desired-email"; desiredEmail: string }
  | { type: "set-password"; password: string }
  | { type: "set-invite-token"; inviteToken: string }
  | { type: "toggle-show-password" }
  | { type: "set-signup-domain"; signupDomain: string };

export function loginFormFieldsReducer(
  state: LoginFormFieldsState,
  action: LoginFormFieldsAction,
): LoginFormFieldsState {
  switch (action.type) {
    case "switch-mode": {
      const next: LoginFormFieldsState = {
        ...state,
        authMode: action.mode,
        showPassword: false,
      };

      if (action.mode !== "sign-up") {
        next.name = "";
        next.inviteToken = "";
      }

      if (action.mode === "forgot-password") {
        next.password = "";
      }

      return next;
    }
    case "set-name":
      return { ...state, name: action.name };
    case "set-email":
      return { ...state, email: action.email };
    case "set-desired-email":
      return { ...state, desiredEmail: action.desiredEmail };
    case "set-password":
      return { ...state, password: action.password };
    case "set-invite-token":
      return { ...state, inviteToken: action.inviteToken };
    case "toggle-show-password":
      return { ...state, showPassword: !state.showPassword };
    case "set-signup-domain":
      return { ...state, signupDomain: action.signupDomain };
    default:
      return state;
  }
}

export type LoginFormChromeAction =
  | { type: "set-passkey-loading"; value: boolean }
  | { type: "set-email-loading"; value: boolean }
  | { type: "set-error"; error: string | null }
  | { type: "set-notice"; notice: string | null }
  | { type: "clear-messages" }
  | { type: "start-email-auth" }
  | { type: "finish-email-auth" }
  | { type: "start-passkey-auth" }
  | { type: "finish-passkey-auth" };

export function loginFormChromeReducer(
  state: LoginFormChromeState,
  action: LoginFormChromeAction,
): LoginFormChromeState {
  switch (action.type) {
    case "set-passkey-loading":
      return { ...state, passkeyLoading: action.value };
    case "set-email-loading":
      return { ...state, emailLoading: action.value };
    case "set-error":
      return { ...state, error: action.error };
    case "set-notice":
      return { ...state, notice: action.notice };
    case "clear-messages":
      return { ...state, error: null, notice: null };
    case "start-email-auth":
      return {
        ...state,
        emailLoading: true,
        error: null,
        notice: null,
      };
    case "finish-email-auth":
      return { ...state, emailLoading: false };
    case "start-passkey-auth":
      return {
        ...state,
        passkeyLoading: true,
        error: null,
        notice: null,
      };
    case "finish-passkey-auth":
      return { ...state, passkeyLoading: false };
    default:
      return state;
  }
}

export type EmailAvailabilityUiAction =
  | { type: "reset"; checking: boolean }
  | { type: "set-result"; availability: EmailAvailabilityValue };

export function emailAvailabilityUiReducer(
  state: EmailAvailabilityUiState,
  action: EmailAvailabilityUiAction,
): EmailAvailabilityUiState {
  switch (action.type) {
    case "reset":
      return { availability: null, checking: action.checking };
    case "set-result":
      return { availability: action.availability, checking: false };
    default:
      return state;
  }
}

export type InviteValidationUiAction =
  | { type: "reset"; validating: boolean }
  | { type: "set-result"; validation: InviteValidationValue };

export function inviteValidationUiReducer(
  state: InviteValidationUiState,
  action: InviteValidationUiAction,
): InviteValidationUiState {
  switch (action.type) {
    case "reset":
      return { validation: null, validating: action.validating };
    case "set-result":
      return { validation: action.validation, validating: false };
    default:
      return state;
  }
}
