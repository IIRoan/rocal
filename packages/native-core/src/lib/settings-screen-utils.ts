export type SettingsAccountActionKey =
  | "change-password"
  | "set-password"
  | "change-profile-picture"
  | "reset-preferences"
  | "sign-out"
  | "delete-account";

export interface SettingsAccountAction {
  key: SettingsAccountActionKey;
  icon: "lock" | "image" | "rotate-ccw" | "log-out" | "trash-2";
  label: string;
  description: string;
  destructive: boolean;
}

const CHANGE_PASSWORD_ACTION: SettingsAccountAction = {
  key: "change-password",
  icon: "lock",
  label: "Change Password",
  description:
    "Update your email sign-in password. Solace also uses it for encryption after email sign-in.",
  destructive: false,
};

const SET_PASSWORD_ACTION: SettingsAccountAction = {
  key: "set-password",
  icon: "lock",
  label: "Set Email Password",
  description:
    "Add an email sign-in password without changing your existing encrypted data.",
  destructive: false,
};

const CHANGE_PROFILE_PICTURE_ACTION: SettingsAccountAction = {
  key: "change-profile-picture",
  icon: "image",
  label: "Profile Picture",
  description: "Set a URL for your profile picture.",
  destructive: false,
};

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
  hasPasswordAccount,
  hasOAuthAccount,
}: {
  canSignOut: boolean;
  hasPasswordAccount: boolean;
  hasOAuthAccount: boolean;
}): SettingsAccountAction[] {
  const authActions: SettingsAccountAction[] = [];

  if (hasPasswordAccount) {
    authActions.push(CHANGE_PASSWORD_ACTION);
  } else if (hasOAuthAccount) {
    authActions.push(SET_PASSWORD_ACTION);
  }

  return canSignOut
    ? [
        ...authActions,
        CHANGE_PROFILE_PICTURE_ACTION,
        RESET_PREFERENCES_ACTION,
        SIGN_OUT_ACTION,
        DELETE_ACCOUNT_ACTION,
      ]
    : [RESET_PREFERENCES_ACTION];
}
