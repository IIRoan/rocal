import { describe, expect, it } from "@jest/globals";

import {
  getAllTimezonePickerOptions,
  getTimezonePickerLabel,
} from "@/components/command-palette/constants";

describe("command palette timezone options", () => {
  const summerDate = new Date("2026-06-16T12:00:00.000Z");

  it("includes abbreviation and offset in labels", () => {
    const label = getTimezonePickerLabel("Europe/Amsterdam", summerDate);

    expect(label).toContain("Amsterdam");
    expect(label).toMatch(/CEST|GMT\+2/);
    expect(label).toContain("UTC+2");
  });

  it("exposes enough grouped options for the settings picker", () => {
    const options = getAllTimezonePickerOptions(summerDate);

    expect(options.length).toBeGreaterThan(50);
    expect(
      options.some((option) => option.searchText.includes("cest")),
    ).toBe(true);
  });
});
