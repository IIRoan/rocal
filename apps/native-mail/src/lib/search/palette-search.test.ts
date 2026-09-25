import { describe, expect, it } from "@jest/globals";
import { mergePaletteSearchResults } from "./palette-search";

describe("mergePaletteSearchResults", () => {
  it("finds historical subjects from the local index even when live search is empty", () => {
    const results = mergePaletteSearchResults({
      titleDocuments: [
        {
          id: "mail:m-1",
          source: "mail",
          title: "Board offsite notes",
          messageId: "m-1",
          timestamp: "2024-01-11T09:00:00.000Z",
          encryptionStatus: "plaintext",
        },
      ],
      query: "offsite",
      messages: [],
      limit: 8,
    });

    expect(results.map((result) => result.id)).toEqual(["mail:m-1"]);
    expect(results[0]?.messageId).toBe("m-1");
  });

  it("ignores calendar documents left in the title index", () => {
    const results = mergePaletteSearchResults({
      titleDocuments: [
        {
          id: "calendar:event-old",
          source: "calendar",
          title: "Board offsite",
          eventId: "event-old",
          encryptionStatus: "encrypted-indexed",
        },
      ],
      query: "offsite",
      messages: [],
      limit: 8,
    });

    expect(results).toEqual([]);
  });

  it("keeps one result when a live message is already in the title index", () => {
    const results = mergePaletteSearchResults({
      titleDocuments: [
        {
          id: "mail:m-1",
          source: "mail",
          title: "Board offsite notes",
          messageId: "m-1",
          encryptionStatus: "plaintext",
        },
      ],
      query: "offsite",
      messages: [{ id: "m-1", subject: "Board offsite notes" }],
      limit: 8,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("mail:m-1");
  });
});
