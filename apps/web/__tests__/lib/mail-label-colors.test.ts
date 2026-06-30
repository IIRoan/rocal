import { describe, expect, it } from "@jest/globals";
import {
  isValidLabelHex,
  normalizeLabelColorInput,
  resolveLabelDisplayColor,
} from "@/lib/mail/mail-label-colors";

describe("mail-label-colors", () => {
  it("resolves preset color names to hex", () => {
    expect(resolveLabelDisplayColor("blue")).toBe("#3b82f6");
    expect(resolveLabelDisplayColor("#22c55e")).toBe("#22c55e");
  });

  it("validates hex colors", () => {
    expect(isValidLabelHex("#abc")).toBe(true);
    expect(isValidLabelHex("blue")).toBe(false);
  });

  it("normalizes preset and hex inputs", () => {
    expect(normalizeLabelColorInput("green")).toBe("#22c55e");
    expect(normalizeLabelColorInput("#6366f1")).toBe("#6366f1");
  });
});
