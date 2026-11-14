import { stripPickedImageMetadata } from "./strip-image-metadata";

const mockSaveAsync = jest.fn();
const mockResize = jest.fn();
const mockDeleteAsync = jest.fn(async (_uri: string) => undefined);
let mockDecoded = { width: 400, height: 300 };

jest.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg", PNG: "png", WEBP: "webp" },
  ImageManipulator: {
    manipulate: (source: unknown) => ({
      renderAsync: async () => ({ ...mockDecoded, source, saveAsync: mockSaveAsync }),
      resize: (size: { width: number; height: number }) => {
        mockResize(size);
        return { renderAsync: async () => ({ ...size, saveAsync: mockSaveAsync }) };
      },
    }),
  },
}));
jest.mock("expo-file-system/legacy", () => ({
  deleteAsync: (uri: string) => mockDeleteAsync(uri),
}));

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe1]);
const HEIC = new Uint8Array([0, 0, 0, 24, ...[..."ftypheic"].map((char) => char.charCodeAt(0))]);
const GIF = new Uint8Array([..."GIF89a"].map((char) => char.charCodeAt(0)));

describe("stripPickedImageMetadata", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDecoded = { width: 400, height: 300 };
    mockSaveAsync.mockResolvedValue({ uri: "file:///cache/out.jpg", base64: "AQID" });
  });

  it("re-encodes a JPEG and deletes the saved cache copy", async () => {
    const result = await stripPickedImageMetadata("file:///cache/in.jpg", { name: "trip.jpg", type: "image/jpeg", bytes: JPEG });
    expect(result).toEqual({ name: "trip.jpg", type: "image/jpeg", bytes: new Uint8Array([1, 2, 3]) });
    expect(mockSaveAsync).toHaveBeenCalledWith({ format: "jpeg", compress: 0.92, base64: true });
    expect(mockResize).not.toHaveBeenCalled();
    expect(mockDeleteAsync).toHaveBeenCalledWith("file:///cache/out.jpg");
  });

  it("turns HEIC into a JPEG and scales photos above the pixel cap", async () => {
    mockDecoded = { width: 8000, height: 6000 };
    const result = await stripPickedImageMetadata("file:///cache/in.heic", { name: "IMG_1.HEIC", type: "image/heic", bytes: HEIC });
    expect(result).toMatchObject({ name: "IMG_1.jpg", type: "image/jpeg" });
    expect(mockResize).toHaveBeenCalledWith({ width: 4729, height: 3547 });
  });

  it("keeps the original with a notice when encoding fails", async () => {
    mockSaveAsync.mockRejectedValueOnce(new Error("encode"));
    const file = { name: "trip.jpg", type: "image/jpeg", bytes: JPEG };
    expect(await stripPickedImageMetadata("file:///cache/in.jpg", file)).toEqual({
      ...file,
      notice: "Couldn't remove location data from trip.jpg. It's attached as is.",
    });
  });

  it("leaves GIFs untouched", async () => {
    const file = { name: "loop.gif", type: "image/gif", bytes: GIF };
    expect(await stripPickedImageMetadata("file:///cache/loop.gif", file)).toBe(file);
    expect(mockSaveAsync).not.toHaveBeenCalled();
  });
});

describe("stripPickedImageMetadata on a binary without the image module", () => {
  it("asks for an update and keeps the original", async () => {
    jest.resetModules();
    jest.doMock("expo-image-manipulator", () => {
      throw new Error("Cannot find native module 'ExpoImageManipulator'");
    });
    const { stripPickedImageMetadata: strip } = await import("./strip-image-metadata");
    const file = { name: "trip.jpg", type: "image/jpeg", bytes: JPEG };
    expect(await strip("file:///cache/in.jpg", file)).toEqual({
      ...file,
      notice: "Update Solace to remove photo location data.",
    });
  });
});
