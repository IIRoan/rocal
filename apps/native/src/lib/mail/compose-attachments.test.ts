import {
  createPendingComposeAttachment,
  formatAttachmentSize,
  toJmapAttachmentInput,
} from "./compose-attachments";

describe("compose attachments", () => {
  it("builds a pending attachment with a fallback type and maps it to a JMAP input", () => {
    const pending = createPendingComposeAttachment({
      name: "notes.txt",
      bytes: new Uint8Array([1, 2, 3]),
    });
    expect(pending.type).toBe("application/octet-stream");
    expect(pending.size).toBe(3);
    expect(toJmapAttachmentInput(pending, "blob-1")).toEqual({
      blobId: "blob-1",
      name: "notes.txt",
      type: "application/octet-stream",
      size: 3,
    });
  });

  it("formats human-readable sizes", () => {
    expect(formatAttachmentSize(500)).toBe("500 B");
    expect(formatAttachmentSize(2048)).toBe("2 KB");
    expect(formatAttachmentSize(1024 * 1024)).toBe("1 MB");
  });
});
