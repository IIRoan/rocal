import { settingsSectionPath } from "@workspace/calendar-core";
import { buildAccountSheetGroups } from "./account-sheet-model";
import { CALENDARS_ROOT_PAGE } from "./calendars-sheet-pages";

describe("buildAccountSheetGroups", () => {
  it("groups settings sections with routes", () => {
    const groups = buildAccountSheetGroups();
    expect(groups.length).toBeGreaterThan(0);
    const rows = groups.flatMap((group) => group.rows);
    const ids = rows.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const row of rows) {
      expect(row.route).toBe(settingsSectionPath(row.id));
    }
    expect(groups.find((group) => group.title === "Security")?.rows[0]?.id).toBe(
      "security",
    );
  });

  it("lists calendars management before calendar settings", () => {
    const calendarGroup = buildAccountSheetGroups().find(
      (group) => group.title === "Calendar",
    );
    expect(
      calendarGroup?.rows.map((row) => ({ id: row.id, label: row.label })),
    ).toEqual([
      { id: CALENDARS_ROOT_PAGE, label: "Calendars" },
      { id: "calendar", label: "Calendar settings" },
    ]);
  });
});
