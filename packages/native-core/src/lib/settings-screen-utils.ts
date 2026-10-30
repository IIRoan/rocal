export type SettingsAccountActionKey =
  | "change-password"
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

const ADD_PROFILE_PICTURE_ACTION: SettingsAccountAction = {
  key: "change-profile-picture",
  icon: "image",
  label: "Add Profile Picture",
  description: "Choose a photo for your profile.",
  destructive: false,
};

const CHANGE_PROFILE_PICTURE_ACTION: SettingsAccountAction = {
  ...ADD_PROFILE_PICTURE_ACTION,
  label: "Change Profile Picture",
  description: "Choose a new photo or remove the current one.",
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
  hasProfilePicture = false,
}: {
  canSignOut: boolean;
  hasPasswordAccount: boolean;
  hasProfilePicture?: boolean;
}): SettingsAccountAction[] {
  const authActions = hasPasswordAccount ? [CHANGE_PASSWORD_ACTION] : [];

  return canSignOut
    ? [
        ...authActions,
        hasProfilePicture
          ? CHANGE_PROFILE_PICTURE_ACTION
          : ADD_PROFILE_PICTURE_ACTION,
        RESET_PREFERENCES_ACTION,
        SIGN_OUT_ACTION,
        DELETE_ACCOUNT_ACTION,
      ]
    : [RESET_PREFERENCES_ACTION];
}
