export type GateMode = "hidden" | "setup" | "unlock" | "legacy";

export type E2eeGateState = {
  mode: GateMode;
  password: string;
  confirmPassword: string;
  error: string | null;
  isSubmitting: boolean;
};

export const initialE2eeGateState: E2eeGateState = {
  mode: "hidden",
  password: "",
  confirmPassword: "",
  error: null,
  isSubmitting: false,
};

export type E2eeGateAction =
  | { type: "reset" }
  | { type: "clear-error" }
  | { type: "set-from-bootstrap"; mode: GateMode; isSubmitting: boolean }
  | { type: "start-submit" }
  | { type: "end-submit" }
  | { type: "set-error"; error: string }
  | { type: "success-hide" }
  | { type: "set-password"; password: string }
  | { type: "set-confirm-password"; confirmPassword: string };

export function e2eeGateReducer(
  state: E2eeGateState,
  action: E2eeGateAction,
): E2eeGateState {
  switch (action.type) {
    case "reset":
      return initialE2eeGateState;
    case "clear-error":
      return { ...state, error: null };
    case "set-from-bootstrap":
      return {
        ...state,
        mode: action.mode,
        isSubmitting: action.isSubmitting,
      };
    case "start-submit":
      return { ...state, isSubmitting: true, error: null };
    case "end-submit":
      return { ...state, isSubmitting: false };
    case "set-error":
      return { ...state, error: action.error };
    case "success-hide":
      return {
        ...state,
        mode: "hidden",
        password: "",
        confirmPassword: "",
        isSubmitting: false,
      };
    case "set-password":
      return { ...state, password: action.password };
    case "set-confirm-password":
      return { ...state, confirmPassword: action.confirmPassword };
    default:
      return state;
  }
}
