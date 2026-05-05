import { getSettingsAccountActions } from "./settings-screen-utils";

describe("Settings screen account actions", () => {
  it("places sign out in the Settings account section", () => {
    expect(getSettingsAccountActions({ canSignOut: true })).toEqual([
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
    ).toEqual(["reset-preferences", "sign-out", "delete-account"]);
  });

  it("marks account actions as destructive for native row styling", () => {
    expect(
      getSettingsAccountActions({ canSignOut: true }).every(
        (action) => action.destructive,
      ),
    ).toBe(true);
  });
});
