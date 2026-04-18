import { describe, expect, it } from "@jest/globals";

import {
  getColorSwatchValue,
  resolveEventColorValue,
  resolveInlineColorValue,
} from "./utils";

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
});

describe("inline color aliases", () => {
  it("keeps swatches and event dots on the same resolver", () => {
    expect(getColorSwatchValue("blue")).toBe(resolveInlineColorValue("blue"));
    expect(resolveEventColorValue("red")).toBe(resolveInlineColorValue("red"));
  });
});