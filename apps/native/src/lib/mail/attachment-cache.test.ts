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
});
