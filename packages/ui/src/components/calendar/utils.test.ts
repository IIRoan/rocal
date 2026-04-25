import { describe, expect, it } from "@jest/globals";

import {
  getColorSwatchValue,
  getEventColorClasses,
  getEventColorStyles,
  resolveEventColorValue,
  resolveInlineColorValue,
} from "./color-utils";

describe("resolveInlineColorValue", () => {
  it("maps blue to the shared sky token", () => {
    expect(resolveInlineColorValue("blue")).toBe("var(--event-sky)");
  });

  it("returns named colors from the shared event token map", () => {
    expect(resolveInlineColorValue("red")).toBe("var(--event-red)");
    expect(resolveInlineColorValue("teal")).toBe("var(--event-teal)");
  });

  it("passes hex colors through unchanged", () => {
    expect(resolveInlineColorValue("#ff00aa")).toBe("#ff00aa");
  });

  it("falls back to the default event color when color is missing", () => {
    expect(resolveInlineColorValue()).toBe("var(--event-default)");
  });

  it("falls back to the default event color when color is empty", () => {
    expect(resolveInlineColorValue("")).toBe("var(--event-default)");
  });

  it("falls back to the default token for unknown named colors", () => {
    expect(resolveInlineColorValue("chartreuse")).toBe("var(--event-default)");
  });
});

describe("inline color aliases", () => {
  it("keeps swatches and event dots on the same resolver", () => {
    expect(getColorSwatchValue("blue")).toBe(resolveInlineColorValue("blue"));
    expect(resolveEventColorValue("red")).toBe(resolveInlineColorValue("red"));
  });
});

describe("getEventColorClasses", () => {
  it.each([
    ["blue", "bg-event-sky"],
    ["sky", "bg-event-sky"],
    ["violet", "bg-event-violet"],
    ["rose", "bg-event-rose"],
    ["emerald", "bg-event-emerald"],
    ["orange", "bg-event-orange"],
    ["red", "bg-event-red"],
    ["cyan", "bg-event-cyan"],
    ["lime", "bg-event-lime"],
    ["amber", "bg-event-amber"],
    ["indigo", "bg-event-indigo"],
    ["pink", "bg-event-pink"],
    ["teal", "bg-event-teal"],
    [undefined, "bg-event-default"],
    ["", "bg-event-default"],
    ["chartreuse", "bg-event-default"],
  ])("maps %p to the expected utility class", (color, expectedClass) => {
    expect(getEventColorClasses(color)).toContain(expectedClass);
  });

  it("uses the adaptive hex class for custom colors", () => {
    expect(getEventColorClasses("#ff00aa")).toContain("event-hex-adaptive");
  });
});

describe("getEventColorStyles", () => {
  it("returns the css custom property for hex colors", () => {
    expect(getEventColorStyles("#ff00aa")).toEqual({
      "--event-hex-color": "#ff00aa",
    });
  });

  it("returns no inline styles for named colors", () => {
    expect(getEventColorStyles("teal")).toEqual({});
  });
});
