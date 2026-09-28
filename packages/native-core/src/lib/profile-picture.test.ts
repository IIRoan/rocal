import { pickProfilePicture } from "./profile-picture";

const mockDelete = jest.fn(async (..._args: unknown[]) => undefined);
const mockPick = jest.fn();
const mockSave = jest.fn();
const mockRender = jest.fn();
const mockContext = {
  crop: jest.fn().mockReturnThis(),
  resize: jest.fn().mockReturnThis(),
  renderAsync: mockRender,
};
jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: (...args: unknown[]) => mockPick(...args),
}));
jest.mock("expo-image-manipulator", () => ({
  ImageManipulator: { manipulate: () => mockContext },
  SaveFormat: { JPEG: "jpeg" },
}));
jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  deleteAsync: (...args: unknown[]) => mockDelete(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockPick.mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///cache/picked.jpg", width: 900, height: 600 }],
  });
  mockRender.mockResolvedValue({ saveAsync: mockSave });
  mockSave.mockResolvedValue({
    uri: "file:///cache/saved.jpg",
    base64: "encoded",
  });
});

it("removes the picker and encoded cache files before returning the image", async () => {
  await expect(pickProfilePicture()).resolves.toBe("encoded");
  expect(mockDelete.mock.calls).toEqual([
    ["file:///cache/picked.jpg", { idempotent: true }],
    ["file:///cache/saved.jpg", { idempotent: true }],
  ]);
});

it("removes the picker file when rendering fails", async () => {
  mockRender.mockRejectedValueOnce(new Error("render failed"));
  await expect(pickProfilePicture()).rejects.toThrow("render failed");
  expect(mockDelete).toHaveBeenCalledWith("file:///cache/picked.jpg", {
    idempotent: true,
  });
});

it("removes the picker file when saving fails", async () => {
  mockSave.mockRejectedValueOnce(new Error("save failed"));
  await expect(pickProfilePicture()).rejects.toThrow("save failed");
  expect(mockDelete).toHaveBeenCalledTimes(1);
});

it("never deletes the original photo outside the app cache", async () => {
  mockPick.mockResolvedValueOnce({
    canceled: false,
    assets: [{ uri: "file:///photos/original.jpg", width: 10, height: 10 }],
  });
  await pickProfilePicture();
  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(mockDelete).toHaveBeenCalledWith("file:///cache/saved.jpg", {
    idempotent: true,
  });
});

it("returns null without files when cancelled", async () => {
  mockPick.mockResolvedValueOnce({ canceled: true });
  await expect(pickProfilePicture()).resolves.toBeNull();
  expect(mockDelete).not.toHaveBeenCalled();
});
