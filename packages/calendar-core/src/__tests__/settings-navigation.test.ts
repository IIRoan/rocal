import { describe, expect, it } from "@jest/globals";
import {
  getSettingsHubItems,
  getSettingsMailItems,
  getSettingsNavItem,
  isSettingsSectionId,
  SETTINGS_HOME_PATH,
  settingsSectionPath,
} from "../settings-navigation";

describe("settings navigation catalog", () => {
  it("keeps the same hub order on both platforms, with App only on native", () => {
    expect(getSettingsHubItems("web").map((item) => item.id)).toEqual([
      "account",
      "appearance",
      "calendar",
      "mail",
      "time-region",
      "notifications",
      "security",
      "invites",
    ]);
    expect(getSettingsHubItems("native").map((item) => item.id)).toEqual([
      "account",
      "appearance",
      "calendar",
      "mail",
      "time-region",
      "notifications",
      "security",
      "invites",
      "app",
    ]);
  });

  it("keeps composing, display, and list settings on web until native mail consumes them", () => {
    expect(getSettingsMailItems("native").map((item) => item.id)).toEqual([
      "mailboxes",
      "labels",
      "contacts",
    ]);
    expect(getSettingsMailItems("web").map((item) => item.id)).toEqual([
      "mailboxes",
      "labels",
      "contacts",
      "composing",
      "mail-display",
      "mail-list",
    ]);
  });

  it("builds settings paths from section ids", () => {
    expect(settingsSectionPath()).toBe(SETTINGS_HOME_PATH);
    expect(settingsSectionPath("mail")).toBe("/settings/mail");
    expect(settingsSectionPath("mailboxes")).toBe("/settings/mailboxes");
    expect(isSettingsSectionId("calendar")).toBe(true);
    expect(isSettingsSectionId("not-a-section")).toBe(false);
    expect(getSettingsNavItem("security")?.label).toBe("Security");
  });
});
