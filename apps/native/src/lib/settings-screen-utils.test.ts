import { getSettingsAccountActions } from "./settings-screen-utils";

describe("Settings screen account actions", () => {
  it("places sign out in the Settings account section", () => {
    expect(getSettingsAccountActions({ canSignOut: true })).toEqual([
      {
        key: "change-password",
        icon: "lock",
        label: "Change Password",
        description: "Update the password used for email sign-in.",
        destructive: false,
      },
      {
        key: "change-profile-picture",
        icon: "image",
        label: "Profile Picture",
        description: "Set a URL for your profile picture.",
        destructive: false,
      },
      {
        key: "reset-preferences",
        icon: "rotate-ccw",
        label: "Reset Preferences",
        description: "Restore the shared defaults used on web and mobile.",
        destructive: true,
      },
      {
        key: "sign-out",
        icon: "log-out",
        label: "Sign Out",
        description: "End this session on this device.",
        destructive: true,
      },
      {
        key: "delete-account",
        icon: "trash-2",
        label: "Delete Account",
        description: "Permanently delete your account and all calendar data.",
        destructive: true,
      },
    ]);
  });

  it("omits sign out when there is no authenticated user", () => {
    expect(
      getSettingsAccountActions({ canSignOut: false }).map(
        (action) => action.key,
      ),
    ).toEqual(["reset-preferences"]);
  });

  it("keeps reset before sign out so destructive session exit is last", () => {
    expect(
      getSettingsAccountActions({ canSignOut: true }).map(
        (action) => action.key,
      ),
    ).toEqual([
      "change-password",
      "change-profile-picture",
      "reset-preferences",
      "sign-out",
      "delete-account",
    ]);
  });

  it("only marks destructive account actions for native row styling", () => {
    expect(
      getSettingsAccountActions({ canSignOut: true }).map((action) => ({
        key: action.key,
        destructive: action.destructive,
      })),
    ).toEqual([
      { key: "change-password", destructive: false },
      { key: "change-profile-picture", destructive: false },
      { key: "reset-preferences", destructive: true },
      { key: "sign-out", destructive: true },
      { key: "delete-account", destructive: true },
    ]);
  });
});
