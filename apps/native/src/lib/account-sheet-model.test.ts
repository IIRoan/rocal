import { settingsSectionPath } from "@workspace/calendar-core";
import { buildAccountSheetGroups } from "./account-sheet-model";

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

  it("filters rows by label or description and drops empty groups", () => {
    const groups = buildAccountSheetGroups("  SECURITY ");
    expect(groups.map((group) => group.title)).toContain("Security");
    for (const group of groups) {
      expect(group.rows.length).toBeGreaterThan(0);
      for (const row of group.rows) {
        const haystack = `${row.label} ${row.description}`.toLowerCase();
        expect(haystack).toContain("security");
      }
    }
  });

  it("returns no groups when nothing matches", () => {
    expect(buildAccountSheetGroups("zzz-no-match")).toEqual([]);
  });
});
