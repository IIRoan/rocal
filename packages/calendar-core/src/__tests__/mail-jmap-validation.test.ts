import { describe, expect, it } from "@jest/globals";
import { parseJmapBlobUploadResponse } from "../../src/mail-jmap-validation";

describe("mail JMAP zod validation", () => {
  it("parses blob upload responses with expected size", () => {
    expect(
      parseJmapBlobUploadResponse(
        { blobId: "blob-1", size: 12, type: "text/plain" },
        12,
        "note.txt",
      ),
    ).toEqual({
      blobId: "blob-1",
      size: 12,
      type: "text/plain",
    });
  });

  it("rejects blob upload responses without a blob id", () => {
    expect(() =>
      parseJmapBlobUploadResponse({ size: 12 }, 12, "note.txt"),
    ).toThrow("note.txt did not return a blob id");
  });
});
