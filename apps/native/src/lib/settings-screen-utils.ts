export type SettingsAccountActionKey =
  | "reset-preferences"
  | "sign-out"
  | "delete-account";

export interface SettingsAccountAction {
  key: SettingsAccountActionKey;
  icon: "rotate-ccw" | "log-out" | "trash-2";
  label: string;
  description: string;
  destructive: boolean;
}

const RESET_PREFERENCES_ACTION: SettingsAccountAction = {
  key: "reset-preferences",
  icon: "rotate-ccw",
  label: "Reset Preferences",
  description: "Restore the shared defaults used on web and mobile.",
  destructive: true,
};

const SIGN_OUT_ACTION: SettingsAccountAction = {
  key: "sign-out",
  icon: "log-out",
  label: "Sign Out",
  description: "End this session on this device.",
  destructive: true,
};

const DELETE_ACCOUNT_ACTION: SettingsAccountAction = {
  key: "delete-account",
  icon: "trash-2",
  label: "Delete Account",
  description: "Permanently delete your account and all calendar data.",
  destructive: true,
};

export function getSettingsAccountActions({
  canSignOut,
}: {
  canSignOut: boolean;
}): SettingsAccountAction[] {
  return canSignOut
    ? [RESET_PREFERENCES_ACTION, SIGN_OUT_ACTION, DELETE_ACCOUNT_ACTION]
    : [RESET_PREFERENCES_ACTION];
}
