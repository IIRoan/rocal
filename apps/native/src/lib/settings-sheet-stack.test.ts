import { describe, expect, it } from "@jest/globals";
import {
  popSheetPage,
  pushSheetPage,
  sheetPageTranslateX,
  topSheetPage,
} from "./settings-sheet-stack";

describe("pushSheetPage", () => {
  it("appends a page without mutating the stack", () => {
    const stack = ["root"];
    const next = pushSheetPage(stack, "calendar");
    expect(next).toEqual(["root", "calendar"]);
    expect(stack).toEqual(["root"]);
  });

  it("ignores pushing the page that is already on top", () => {
    expect(pushSheetPage(["root", "calendar"], "calendar")).toEqual([
      "root",
      "calendar",
    ]);
  });

  it("allows revisiting a page that is not on top", () => {
    expect(
      pushSheetPage(["root", "time-region", "timezone"], "time-region"),
    ).toEqual(["root", "time-region", "timezone", "time-region"]);
  });
});

describe("popSheetPage", () => {
  it("removes the top page", () => {
    expect(popSheetPage(["root", "time-region", "timezone"], "root")).toEqual([
      "root",
      "time-region",
    ]);
  });

  it("resets to the root instead of emptying the stack", () => {
    expect(popSheetPage(["root"], "root")).toEqual(["root"]);
  });
});

describe("topSheetPage", () => {
  it("returns the last page", () => {
    expect(topSheetPage(["root", "mail"], "root")).toBe("mail");
  });

  it("falls back to the root for an empty stack", () => {
    expect(topSheetPage([], "root")).toBe("root");
  });
});

describe("sheetPageTranslateX", () => {
  const width = 400;

  it("shows the top page in place and parks the page below in parallax", () => {
    expect(sheetPageTranslateX(1, 1, width)).toBe(0);
    expect(sheetPageTranslateX(0, 1, width)).toBe(-120);
  });

  it("keeps a freshly pushed page off-screen until the position advances", () => {
    expect(sheetPageTranslateX(2, 1, width)).toBe(width);
  });

  it("tracks a half-finished back swipe", () => {
    expect(sheetPageTranslateX(1, 0.5, width)).toBe(200);
    expect(sheetPageTranslateX(0, 0.5, width)).toBe(-60);
  });
});
