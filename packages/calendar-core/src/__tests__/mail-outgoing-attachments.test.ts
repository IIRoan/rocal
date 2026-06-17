import { describe, expect, it } from "@jest/globals";
import {
  prepareOutgoingAttachments,
  validateUploadedAttachmentSet,
  validateUploadedBlob,
} from "../../src/mail-outgoing-attachments";

describe("mail outgoing attachment validation", () => {
  it("rejects empty attachment files before upload", async () => {
    await expect(
      prepareOutgoingAttachments([
        {
          name: "empty.txt",
          type: "text/plain",
          size: 0,
          arrayBuffer: async () => new ArrayBuffer(0),
        },
      ]),
    ).rejects.toThrow('empty.txt" is empty');
  });

  it("rejects partially read attachment files", async () => {
    await expect(
      prepareOutgoingAttachments([
        {
          name: "partial.bin",
          type: "application/octet-stream",
          size: 4,
          arrayBuffer: async () => new Uint8Array([1, 2]).buffer,
        },
      ]),
    ).rejects.toThrow("could not be read completely");
  });

  it("validates uploaded blob ids and sizes", () => {
    expect(
      validateUploadedBlob({
        blobId: "blob-1",
        size: 12,
        expectedSize: 12,
        label: "note.txt",
      }),
    ).toEqual({ blobId: "blob-1", size: 12 });

    expect(() =>
      validateUploadedBlob({
        blobId: "",
        size: 12,
        expectedSize: 12,
        label: "note.txt",
      }),
    ).toThrow("note.txt did not return a blob id");
  });

  it("validates uploaded attachment sets by count and size", () => {
    expect(() =>
      validateUploadedAttachmentSet(
        [{ filename: "a.txt", size: 3 }],
        [{ blobId: "blob-a", name: "a.txt", size: 2 }],
      ),
    ).toThrow('uploaded with the wrong size');

    expect(() =>
      validateUploadedAttachmentSet(
        [{ filename: "a.txt", size: 3 }],
        [],
      ),
    ).toThrow("Only 0 of 1 attachments uploaded");
  });
});
