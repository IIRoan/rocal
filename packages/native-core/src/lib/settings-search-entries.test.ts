import { filterAccountSheetSearchEntries } from "./account-sheet-model";
import { SHARED_SETTINGS_SEARCH_ENTRIES } from "./settings-search-entries";

describe("settings search entries", () => {
  it("finds the light theme from a settings query", () => {
    const results = filterAccountSheetSearchEntries(
      SHARED_SETTINGS_SEARCH_ENTRIES,
      "light mode",
    );
    expect(results.map((r) => [r.pageId, r.label])).toEqual([
      ["appearance", "Light"],
    ]);
  });

  it("returns nothing for a blank query", () => {
    expect(
      filterAccountSheetSearchEntries(SHARED_SETTINGS_SEARCH_ENTRIES, "  "),
    ).toEqual([]);
  });

  it("matches the location and keywords", () => {
    const labels = filterAccountSheetSearchEntries(
      SHARED_SETTINGS_SEARCH_ENTRIES,
      "passkey",
    ).map((r) => r.label);
    expect(labels).toContain("Passkeys");
  });

  it.each(["privacy", "support"])(
    "makes %s available through settings search in both apps",
    (query) => {
      const results = filterAccountSheetSearchEntries(
        SHARED_SETTINGS_SEARCH_ENTRIES,
        query,
      );
      expect(
        results.some(
          (entry) =>
            entry.pageId === "app" && entry.label.toLowerCase().includes(query),
        ),
      ).toBe(true);
    },
  );
});
