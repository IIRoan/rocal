import { getColorTextValue, isAccentColor } from "./color-utils";

describe("solace color utils", () => {
  it("maps text and accent tokens", () => {
    expect(getColorTextValue("secondary")).toBe("var(--text-secondary)");
    expect(getColorTextValue("orange")).toBe("var(--accent-orange-primary)");
    expect(isAccentColor("primary")).toBe(false);
    expect(isAccentColor("orange")).toBe(true);
  });
});
