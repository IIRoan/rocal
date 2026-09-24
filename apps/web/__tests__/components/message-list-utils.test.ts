import { describe, expect, it } from "@jest/globals";
import {
  getRowHeight,
  ROW_HEIGHT_MOBILE,
  ROW_HEIGHT_MOBILE_COMFORTABLE,
  ROW_HEIGHT_NARROW,
  ROW_HEIGHT_NARROW_WITH_LABELS,
} from "../../components/mail/message-list/message-list-utils";
import type { JmapEmailMessage, LabelDef } from "../../lib/mail/types";

const labels = [{ id: "l1", name: "Work", color: "#3b82f6" }] as LabelDef[];
// Only id and keywords matter for label detection.
const labelled = { id: "m1", keywords: { "label:l1": true } } as unknown as JmapEmailMessage;

describe("getRowHeight", () => {
  it("keeps the full mobile height for labelled rows", () => {
    expect(getRowHeight(labelled, labels, true, "compact")).toBe(ROW_HEIGHT_MOBILE);
    expect(getRowHeight(labelled, labels, true, "comfortable")).toBe(
      ROW_HEIGHT_MOBILE_COMFORTABLE,
    );
  });

  it("uses the stacked heights for the narrow desktop list", () => {
    const plain = { id: "m2", keywords: {} } as unknown as JmapEmailMessage;
    expect(getRowHeight(plain, labels, false, "compact", true, true)).toBe(
      ROW_HEIGHT_NARROW,
    );
    expect(getRowHeight(labelled, labels, false, "comfortable", true, true)).toBe(
      ROW_HEIGHT_NARROW_WITH_LABELS,
    );
  });
});
