import { describe, expect, it } from "@jest/globals";
import {
  BASE_SETTINGS_NAVIGATION_ITEMS,
  getBaseSettingsNavigationItems,
  getRootBaseSettingsNavigationItems,
} from "../../components/command-palette/base-navigation";
import { NAVIGATION_ITEMS, SEARCH_INDEX } from "../../components/command-palette/navigation-config";

describe("base command palette navigation", () => {
  it("defines shared settings used by app-specific palettes", () => {
    expect(BASE_SETTINGS_NAVIGATION_ITEMS.map((item) => item.id)).toEqual([
      "appearance",
      "time-region",
      "notifications",
      "account",
      "security",
      "invites",
    ]);
  });

  it("composes the calendar palette from shared base settings plus calendar-specific items", () => {
    const ids = NAVIGATION_ITEMS.map((item) => item.id);

    expect(ids).toEqual(
      expect.arrayContaining([
        "events",
        "calendars",
        "calendar-defaults",
        ...BASE_SETTINGS_NAVIGATION_ITEMS.map((item) => item.id),
      ]),
    );
    expect(SEARCH_INDEX.map((item) => item.id)).toEqual(
      expect.arrayContaining(["email-notifications", "app-notifications"]),
    );
  });

  it("lets app-specific palettes reuse base settings with contextual descriptions", () => {
    const mailBaseItems = getBaseSettingsNavigationItems({
      timezone: "Europe/Amsterdam",
    });

    expect(mailBaseItems.find((item) => item.id === "time-region")).toMatchObject({
      label: "Time & Region",
      description: "Europe/Amsterdam",
    });
    expect(mailBaseItems.find((item) => item.id === "security")).toMatchObject({
      parent: "account",
    });
  });

  it("exposes only root settings for top-level palette navigation", () => {
    expect(
      getRootBaseSettingsNavigationItems().map((item) => item.id),
    ).toEqual(["appearance", "time-region", "notifications", "account"]);
  });
});
