import {
  fitImageToMaxPixels,
  IMAGE_REENCODE_MAX_PIXELS,
  imageFileNameForType,
  planImageMetadataStrip,
} from "../mail-image-metadata";

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));
const bytes = (...parts: number[][]) => new Uint8Array(parts.flat());
const pngChunk = (type: string, length = 0) => [0, 0, 0, length, ...ascii(type), ...new Array<number>(length + 4).fill(0)];

const JPEG = bytes([0xff, 0xd8, 0xff, 0xe1]);
const PNG_SIGNATURE = [0x89, ...ascii("PNG"), 0x0d, 0x0a, 0x1a, 0x0a];
const PNG = bytes(PNG_SIGNATURE, pngChunk("IHDR", 13), pngChunk("IDAT", 2));
const APNG = bytes(PNG_SIGNATURE, pngChunk("IHDR", 13), pngChunk("acTL", 8), pngChunk("IDAT", 2));
const webp = (flags: number) => bytes(ascii("RIFF"), [0, 0, 0, 0], ascii("WEBPVP8X"), [10, 0, 0, 0, flags]);
const GIF = bytes(ascii("GIF89a"));
const heic = (brand: string) => bytes([0, 0, 0, 24], ascii("ftyp"), ascii(brand));

describe("planImageMetadataStrip", () => {
  it("re-encodes still images whose declared type matches their bytes", () => {
    expect(planImageMetadataStrip({ name: "a.jpeg", type: "image/jpeg", bytes: JPEG })).toEqual({
      action: "reencode",
      outputType: "image/jpeg",
      outputName: "a.jpeg",
    });
    expect(planImageMetadataStrip({ name: "a.png", type: "IMAGE/PNG", bytes: PNG })).toMatchObject({
      outputType: "image/png",
    });
    expect(planImageMetadataStrip({ name: "a.webp", type: "image/webp", bytes: webp(0x10) })).toMatchObject({
      outputType: "image/webp",
    });
  });

  it("turns HEIC into a JPEG named .jpg", () => {
    for (const brand of ["heic", "heix", "mif1", "msf1"]) {
      expect(planImageMetadataStrip({ name: "IMG_1.HEIC", type: "image/heic", bytes: heic(brand) })).toEqual({
        action: "reencode",
        outputType: "image/jpeg",
        outputName: "IMG_1.jpg",
      });
    }
    expect(planImageMetadataStrip({ name: "a.heic", type: "image/heic", bytes: heic("avif") })).toEqual({ action: "keep" });
  });

  it("keeps GIFs, animations, mismatched types and unknown files", () => {
    expect(planImageMetadataStrip({ name: "a.gif", type: "image/gif", bytes: GIF })).toEqual({ action: "keep" });
    expect(planImageMetadataStrip({ name: "a.png", type: "image/png", bytes: APNG })).toEqual({ action: "keep" });
    expect(planImageMetadataStrip({ name: "a.webp", type: "image/webp", bytes: webp(0x12) })).toEqual({ action: "keep" });
    expect(planImageMetadataStrip({ name: "a.png", type: "image/png", bytes: JPEG })).toEqual({ action: "keep" });
    expect(planImageMetadataStrip({ name: "a.jpg", type: undefined, bytes: JPEG })).toEqual({ action: "keep" });
    expect(planImageMetadataStrip({ name: "a.pdf", type: "application/pdf", bytes: bytes(ascii("%PDF")) })).toEqual({ action: "keep" });
  });
});

describe("image re-encode helpers", () => {
  it("names files for their encoded type", () => {
    expect(imageFileNameForType("photo.webp", "image/png")).toBe("photo.png");
    expect(imageFileNameForType("photo", "image/jpeg")).toBe("photo.jpg");
    expect(imageFileNameForType(".hidden", "image/jpeg")).toBe(".hidden.jpg");
  });

  it("scales down past the pixel cap and keeps the aspect", () => {
    expect(fitImageToMaxPixels(4000, 3000)).toEqual({ width: 4000, height: 3000 });
    const scaled = fitImageToMaxPixels(8000, 6000);
    expect(scaled.width * scaled.height).toBeLessThanOrEqual(IMAGE_REENCODE_MAX_PIXELS);
    expect(scaled.width / scaled.height).toBeCloseTo(4 / 3, 2);
    expect(scaled.width).toBe(4729);
  });
});
