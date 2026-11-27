import { pickComposeAttachments, pickComposePhoto } from "./compose-pickers";

const mockLaunch = jest.fn();
const mockDelete = jest.fn(async (_uri: string) => undefined);
const mockStrip = jest.fn(async (_uri: string, file: { name: string; type?: string; bytes: Uint8Array }) => ({ ...file, name: "clean.jpg", type: "image/jpeg", bytes: new Uint8Array([9]) }));
const mockDocuments = jest.fn();

jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: (options: unknown) => mockLaunch(options),
  UIImagePickerPreferredAssetRepresentationMode: { Compatible: "compatible" },
}));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: (options: unknown) => mockDocuments(options) }));
jest.mock("expo-file-system/legacy", () => ({
  EncodingType: { Base64: "base64" },
  readAsStringAsync: async () => "/9j/4Q==",
  deleteAsync: (uri: string) => mockDelete(uri),
}));
jest.mock("./strip-image-metadata", () => ({
  stripPickedImageMetadata: (uri: string, file: { name: string; type?: string; bytes: Uint8Array }) => mockStrip(uri, file),
}));

beforeEach(() => jest.clearAllMocks());

it("inserts a library photo as a data URL only after removing its metadata, then deletes the picker copy", async () => {
  mockLaunch.mockResolvedValueOnce({ canceled: false, assets: [{ uri: "file:///cache/p.jpg", fileName: "p.jpg", mimeType: "image/jpeg", fileSize: 4 }] });
  await expect(pickComposePhoto(1024, jest.fn())).resolves.toEqual({ src: "data:image/jpeg;base64,CQ==", alt: "clean.jpg" });
  expect(mockLaunch).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ["images"], preferredAssetRepresentationMode: "compatible" }));
  expect(mockStrip).toHaveBeenCalledWith("file:///cache/p.jpg", expect.objectContaining({ name: "p.jpg" }));
  expect(mockDelete).toHaveBeenCalledWith("file:///cache/p.jpg");
});

it("refuses a photo over the size limit or in a format mail cannot show inline", async () => {
  mockLaunch.mockResolvedValueOnce({ canceled: false, assets: [{ uri: "file:///cache/big.jpg", fileName: "big.jpg", mimeType: "image/jpeg", fileSize: 5000 }] });
  await expect(pickComposePhoto(1024, null)).rejects.toThrow();
  mockLaunch.mockResolvedValueOnce({ canceled: false, assets: [{ uri: "file:///cache/a.heic", fileName: "a.heic", mimeType: "image/heic", fileSize: 4 }] });
  await expect(pickComposePhoto(1024, null)).rejects.toThrow("Attach it instead");
  mockLaunch.mockResolvedValueOnce({ canceled: true, assets: [] });
  await expect(pickComposePhoto(1024, null)).resolves.toBeNull();
});

it("attaches every picked file it can and reports the ones it refuses", async () => {
  mockDocuments.mockResolvedValueOnce({
    canceled: false,
    assets: [
      { uri: "file:///cache/a.txt", name: "a.txt", mimeType: "text/plain", size: 4 },
      { uri: "file:///cache/big.bin", name: "big.bin", mimeType: "application/octet-stream", size: 5000 },
    ],
  });
  const onAttach = jest.fn();
  const onError = jest.fn();
  await pickComposeAttachments(1024, null, onAttach, onError);
  expect(mockDocuments).toHaveBeenCalledWith(expect.objectContaining({ multiple: true }));
  expect(onAttach).toHaveBeenCalledWith(expect.objectContaining({ name: "a.txt", size: 4 }));
  expect(onError).toHaveBeenCalledTimes(1);
  expect(mockDelete).toHaveBeenCalledWith("file:///cache/a.txt");
  expect(mockDelete).toHaveBeenCalledWith("file:///cache/big.bin");
});
