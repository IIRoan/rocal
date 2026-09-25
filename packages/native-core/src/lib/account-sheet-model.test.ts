import { settingsSectionPath } from "@workspace/calendar-core";
import {
  accountSheetGroupDefs,
  buildAccountSheetGroups,
} from "./account-sheet-model";

describe("buildAccountSheetGroups", () => {
  const defs = accountSheetGroupDefs({
    title: "Mail",
    ids: ["mail", "mailboxes", "labels", "contacts"],
  });

  it("groups settings sections with routes", () => {
    const groups = buildAccountSheetGroups(defs);
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

  it("places the app group after appearance", () => {
    expect(buildAccountSheetGroups(defs).map((group) => group.title)).toEqual([
      "Appearance",
      "Mail",
      "Notifications",
      "Security",
      "Account",
    ]);
  });

  it("prefers label overrides and drops ids without a label", () => {
    const groups = buildAccountSheetGroups(
      [{ title: "Calendar", ids: ["calendars", "calendar", "missing"] }],
      { calendars: "Calendars", calendar: "Calendar settings" },
    );
    expect(groups[0]?.rows.map((row) => row.label)).toEqual([
      "Calendars",
      "Calendar settings",
    ]);
  });
});
