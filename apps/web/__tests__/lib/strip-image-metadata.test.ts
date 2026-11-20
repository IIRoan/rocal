/**
 * @jest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { DEFAULT_MAIL_COMPOSE_SETTINGS } from "@workspace/calendar-core";

const mockToastError = jest.fn();
jest.mock("@workspace/ui/lib/toast", () => ({
  toast: { error: (message: string) => mockToastError(message) },
}));

import { prepareOutgoingImageFiles, stripImageMetadata } from "@/lib/mail/strip-image-metadata";
import { writeMailComposeSettings } from "@/lib/mail/compose-settings";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x45, 0x78, 0x69, 0x66]);
const WEBP = new Uint8Array([...new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ")]);
const GIF = new Uint8Array([...new TextEncoder().encode("GIF89a")]);
const HEIC = new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode("ftypheic")]);

const close = jest.fn();
const drawImage = jest.fn();
const convertToBlob = jest.fn(
  async (options: { type: string; quality: number }) => new Blob(["clean"], { type: options.type }),
);
const canvasSizes: Array<[number, number]> = [];
let bitmapSize = { width: 400, height: 300 };
const createImageBitmap = jest.fn(async () => ({ ...bitmapSize, close }));

class FakeOffscreenCanvas {
  constructor(width: number, height: number) {
    canvasSizes.push([width, height]);
  }
  getContext() {
    return { drawImage };
  }
  convertToBlob = convertToBlob;
}

// jsdom's File has no arrayBuffer().
function file(bytes: Uint8Array<ArrayBuffer>, name: string, type: string) {
  const created = new File([bytes], name, { type, lastModified: 7 });
  Object.defineProperty(created, "arrayBuffer", { value: async () => bytes.slice().buffer });
  return created;
}

describe("stripImageMetadata", () => {
  beforeEach(() => {
    Object.assign(globalThis, { createImageBitmap, OffscreenCanvas: FakeOffscreenCanvas });
    jest.clearAllMocks();
    canvasSizes.length = 0;
    bitmapSize = { width: 400, height: 300 };
    localStorage.clear();
  });
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "createImageBitmap");
    Reflect.deleteProperty(globalThis, "OffscreenCanvas");
  });

  it("re-encodes a JPEG with the same type at the shared quality", async () => {
    const result = await stripImageMetadata(file(JPEG, "trip.jpg", "image/jpeg"));
    expect(result.outcome).toBe("stripped");
    expect(result.file).toMatchObject({ name: "trip.jpg", type: "image/jpeg", lastModified: 7 });
    expect(result.file.size).toBe("clean".length);
    expect(convertToBlob).toHaveBeenCalledWith({ type: "image/jpeg", quality: 0.92 });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("scales photos above the pixel cap down", async () => {
    bitmapSize = { width: 8000, height: 6000 };
    await stripImageMetadata(file(JPEG, "big.jpg", "image/jpeg"));
    expect(canvasSizes).toEqual([[4729, 3547]]);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 4729, 3547);
  });

  it("names the file after the type the browser actually encoded", async () => {
    convertToBlob.mockResolvedValueOnce(new Blob(["clean"], { type: "image/png" }));
    const result = await stripImageMetadata(file(WEBP, "sticker.webp", "image/webp"));
    expect(result.file).toMatchObject({ name: "sticker.png", type: "image/png" });
  });

  it("keeps the original when the browser cannot decode it", async () => {
    createImageBitmap.mockRejectedValueOnce(new Error("HEIC unsupported"));
    const original = file(JPEG, "photo.jpg", "image/jpeg");
    const result = await stripImageMetadata(original);
    expect(result).toEqual({ file: original, outcome: "failed" });
  });

  it("reports an untyped HEIC the browser cannot decode, so the notice shows", async () => {
    createImageBitmap.mockRejectedValueOnce(new Error("HEIC unsupported"));
    const original = file(HEIC, "IMG_1.HEIC", "");
    expect(await stripImageMetadata(original)).toEqual({ file: original, outcome: "failed" });
  });

  it("leaves GIFs untouched", async () => {
    const original = file(GIF, "loop.gif", "image/gif");
    expect(await stripImageMetadata(original)).toEqual({ file: original, outcome: "unchanged" });
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it("never reads a file whose type cannot be re-encoded", async () => {
    const original = new File([JPEG], "report.pdf", { type: "application/pdf" });
    const arrayBuffer = jest.fn(async () => JPEG.slice().buffer);
    Object.defineProperty(original, "arrayBuffer", { value: arrayBuffer });
    expect(await stripImageMetadata(original)).toEqual({ file: original, outcome: "unchanged" });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("follows the compose setting and warns about files it could not clean", async () => {
    const original = file(JPEG, "photo.jpg", "image/jpeg");
    writeMailComposeSettings({ ...DEFAULT_MAIL_COMPOSE_SETTINGS, stripImageMetadata: false }, { sync: false });
    expect(await prepareOutgoingImageFiles([original])).toEqual([original]);
    expect(createImageBitmap).not.toHaveBeenCalled();

    writeMailComposeSettings({ ...DEFAULT_MAIL_COMPOSE_SETTINGS, stripImageMetadata: true }, { sync: false });
    createImageBitmap.mockRejectedValueOnce(new Error("decode"));
    expect(await prepareOutgoingImageFiles([original])).toEqual([original]);
    expect(mockToastError).toHaveBeenCalledWith(
      "Couldn't remove location data from photo.jpg. It's attached as is.",
    );
  });
});
