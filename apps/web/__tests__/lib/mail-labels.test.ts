import { describe, expect, it } from "@jest/globals";
import {
  getAllMessageLabels,
  getMessageLabels,
} from "@/lib/mail/mail-labels";
import type { JmapEmailMessage, LabelDef } from "@/lib/mail/types";

const knownLabels: LabelDef[] = [
  { id: "work", name: "Work", color: "#3b82f6" },
  { id: "personal", name: "Personal", color: "#22c55e" },
];

const message = {
  id: "m1",
  keywords: {
    "label:work": true,
    "label:ghost": true,
  },
} as JmapEmailMessage;

describe("mail-labels", () => {
  it("returns assigned known labels", () => {
    expect(getMessageLabels(message, knownLabels)).toEqual([
      knownLabels[0],
    ]);
  });

  it("includes unknown label keywords as ghost labels", () => {
    const labels = getAllMessageLabels(message, knownLabels);
    expect(labels).toEqual(
      expect.arrayContaining([
        knownLabels[0],
        expect.objectContaining({ id: "ghost", name: "ghost" }),
      ]),
    );
  });
});
