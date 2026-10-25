import {
  buildAttachmentCachePath,
  inferAttachmentMimeType,
} from "./attachment-path";

describe("attachment path helpers", () => {
  it("infers png mime type from file name when server type is missing", () => {
    expect(
      inferAttachmentMimeType("LOGO_REV_BLUE_1 (2).png", "application/octet-stream"),
    ).toBe("image/png");
  });

  it("builds cache paths with a file extension", () => {
    const path = buildAttachmentCachePath(
      "cp3khzyld1zg",
      "LOGO_REV_BLUE_1 (2).png",
      "image/png",
      "/cache/",
    );
    expect(path).toMatch(/\.png$/);
    expect(path).toContain("LOGO_REV_BLUE_1");
    expect(path).toContain("cp3khzyld1zg");
  });

  it("caches a file as the type it is previewed as, so a page named like HTML never loads as HTML", () => {
    expect(
      buildAttachmentCachePath("key", "invoice.html", "application/pdf", "/cache/"),
    ).toMatch(/\.pdf$/);
  });

  it("keeps sender-chosen extension characters out of the cache path", () => {
    expect(
      buildAttachmentCachePath("key", "invoice.(pdf", "application/zip", "/cache/"),
    ).toBe("/cache/invoice._pdf-key.bin");
    expect(
      buildAttachmentCachePath("key", "a./x", "application/zip", "/cache/"),
    ).toBe("/cache/a._x-key.bin");
  });
});
