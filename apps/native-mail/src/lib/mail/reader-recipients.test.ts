import { formatAttachmentCount, readerAttachmentIcon } from "./reader-recipients";

describe("readerAttachmentIcon", () => {
  it("maps preview kinds to Feather icons", () => {
    expect(readerAttachmentIcon("image")).toBe("image");
    expect(readerAttachmentIcon("pdf")).toBe("file-text");
    expect(readerAttachmentIcon("text")).toBe("file-text");
    expect(readerAttachmentIcon(null)).toBe("file");
  });
});

describe("formatAttachmentCount", () => {
  it("pluralizes", () => {
    expect(formatAttachmentCount(1)).toBe("1 Attachment");
    expect(formatAttachmentCount(2)).toBe("2 Attachments");
  });
});
