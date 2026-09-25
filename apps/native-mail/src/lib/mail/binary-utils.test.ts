import {
  bytesToBase64,
  decodeBase64ToBytes,
  normalizeAttachmentContent,
} from "./binary-utils";

describe("binary-utils", () => {
  it("round-trips bytes through base64", () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    expect(decodeBase64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it("decodes base64 attachment strings", () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const encoded = bytesToBase64(bytes);
    expect(normalizeAttachmentContent(encoded)).toEqual(bytes);
  });

  it("preserves raw latin1 bytes for binary strings", () => {
    const bytes = new Uint8Array([0x00, 0xff, 0x7f]);
    const raw = String.fromCharCode(...bytes);
    expect(normalizeAttachmentContent(raw)).toEqual(bytes);
  });
});
