import { formatShortcut, isApplePlatform } from "./use-shortcut-label";

describe("shortcut labels", () => {
  it("detects Apple platforms", () => {
    expect(isApplePlatform("MacIntel")).toBe(true);
    expect(isApplePlatform("iPhone")).toBe(true);
    expect(isApplePlatform("Linux x86_64")).toBe(false);
    expect(isApplePlatform("Win32")).toBe(false);
  });

  it("writes Cmd as ⌘ on Apple devices and Ctrl+ elsewhere", () => {
    expect(formatShortcut("S", true)).toBe("⌘S");
    expect(formatShortcut("↵", false)).toBe("Ctrl+↵");
  });
});
