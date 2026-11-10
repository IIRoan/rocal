import { randomUUID } from "expo-crypto";
import {
  activateSessionData,
  closeSessionData,
} from "@workspace/native-core/lib/session-data-lifecycle";
import * as FileSystem from "expo-file-system/legacy";
import {
  clearAttachmentCache,
  writeAttachmentToCache,
  releaseCachedAttachment,
  pruneAttachmentCache,
} from "./attachment-cache";
import {
  buildAttachmentCachePath,
  inferAttachmentMimeType,
} from "./attachment-path";

jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  EncodingType: { Base64: "base64" },
  makeDirectoryAsync: jest.fn(async () => undefined),
  writeAsStringAsync: jest.fn(async () => undefined),
  deleteAsync: jest.fn(async () => undefined),
  readDirectoryAsync: jest.fn(async () => []),
  getInfoAsync: jest.fn(async (uri: string) => ({
    exists: true,
    uri,
    isDirectory: !/\.(pdf|json)$/.test(uri),
  })),
}));
jest.mock("./mail-offline-store", () => ({
  MAIL_OFFLINE_SNAPSHOT_FILE: "solace-mail-offline-snapshot.json",
}));
jest.mock("expo-sharing", () => ({}));
jest.mock("expo-crypto", () => ({ randomUUID: jest.fn(() => "opaque-id") }));
jest.mock("react-native", () => ({ Linking: {}, Platform: { OS: "ios" } }));

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

describe("attachment cache", () => {
  beforeEach(async () => {
    await clearAttachmentCache();
    activateSessionData("u1");
    jest.clearAllMocks();
  });
  it("keeps decrypted attachments only in the folder that sign-out wipes", async () => {
    const cached = await writeAttachmentToCache({
      attachment: { name: "report.pdf", type: "application/pdf", content: new Uint8Array([1, 2]) },
      cacheKey: "b1",
    });
    expect(cached.uri).toBe(
      "file:///cache/mail-attachments/report-opaque-id.pdf",
    );

    await clearAttachmentCache();
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith("file:///cache/mail-attachments/", {
      idempotent: true,
    });
  });

  it("also wipes decrypted files earlier builds left in the cache root, keeping the mailbox snapshot and other caches", async () => {
    jest.mocked(FileSystem.deleteAsync).mockClear();
    jest
      .mocked(FileSystem.readDirectoryAsync)
      .mockResolvedValueOnce([
        "invoice-cp3khzyld1zg.pdf",
        "solace-mail-offline-snapshot.json",
        "mail-attachments",
        "ImagePicker",
      ]);

    await clearAttachmentCache();

    expect(jest.mocked(FileSystem.deleteAsync).mock.calls.map(([uri]) => uri).sort()).toEqual([
      "file:///cache/invoice-cp3khzyld1zg.pdf",
      "file:///cache/mail-attachments/",
    ]);
  });
});

function deferred() {
  let resolve = () => undefined as void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("attachment acquisition lifecycle", () => {
  beforeEach(async () => {
    await clearAttachmentCache();
    activateSessionData("u1");
    jest.clearAllMocks();
  });

  it("shares one pending download for an immutable blob", async () => {
    const finish = deferred();
    const downloadBlob = jest.fn(async () => {
      await finish.promise;
      return new Uint8Array([1]);
    });
    const runtime = {
      accountId: "acc",
      session: { apiUrl: "http://localhost:4001/api/mail/jmap", accounts: { acc: {} }, primaryAccounts: { "urn:ietf:params:jmap:mail": "acc" } },
      client: { downloadBlob },
    } satisfies NonNullable<Parameters<typeof writeAttachmentToCache>[0]["runtime"]>;
    const input = {
      attachment: { blobId: "blob", name: "report.pdf" },
      cacheKey: "m1:p1",
      runtime,
    };
    const first = writeAttachmentToCache(input);
    const second = writeAttachmentToCache(input);
    finish.resolve();
    const values = await Promise.all([first, second]);
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledTimes(1);
    expect(values[0]).toBe(values[1]);
  });

  it("keeps identical names from different message parts distinct", async () => {
    jest
      .mocked(randomUUID)
      .mockReturnValueOnce("part-one")
      .mockReturnValueOnce("part-two");
    const attachment = { name: "report.pdf", content: new Uint8Array([1]) };
    const first = await writeAttachmentToCache({
      attachment,
      cacheKey: "message1:part1",
    });
    const second = await writeAttachmentToCache({
      attachment,
      cacheKey: "message2:part1",
    });
    expect(first.uri).not.toBe(second.uri);
  });

  it("does not materialize a download completed after session closure", async () => {
    const entered = deferred();
    const finish = deferred();
    const runtime = {
      accountId: "acc",
      session: { apiUrl: "http://localhost:4001/api/mail/jmap", accounts: { acc: {} }, primaryAccounts: { "urn:ietf:params:jmap:mail": "acc" } },
      client: {
        downloadBlob: async () => {
          entered.resolve();
          await finish.promise;
          return new Uint8Array([1]);
        },
      },
    } satisfies NonNullable<Parameters<typeof writeAttachmentToCache>[0]["runtime"]>;
    const pending = writeAttachmentToCache({
      attachment: { name: "report.pdf", blobId: "blob" },
      cacheKey: "m1:p1",
      runtime,
    });
    const result = expect(pending).rejects.toThrow("session ended");
    await entered.promise;
    await closeSessionData();
    finish.resolve();
    await result;
    expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalled();
  });

  it("removes a released preview file", async () => {
    const cached = await writeAttachmentToCache({
      attachment: { name: "report.pdf", content: new Uint8Array([1]) },
      cacheKey: "part",
    });
    await releaseCachedAttachment(cached);
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(cached.uri, {
      idempotent: true,
    });
  });

  it("prunes expired inactive files without removing the encrypted snapshot", async () => {
    jest
      .mocked(FileSystem.readDirectoryAsync)
      .mockResolvedValueOnce(["old.pdf", "recent.pdf"]);
    jest
      .mocked(FileSystem.getInfoAsync)
      .mockImplementation(async (uri) => ({
        exists: true,
        uri,
        isDirectory: uri.endsWith("/"),
        modificationTime: uri.endsWith("old.pdf") ? 1 : Date.now() / 1000,
        size: 1,
      }));
    await pruneAttachmentCache();
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
      "file:///cache/mail-attachments/old.pdf",
      { idempotent: true },
    );
    expect(FileSystem.deleteAsync).not.toHaveBeenCalledWith(
      "file:///cache/mail-attachments/recent.pdf",
      expect.anything(),
    );
  });
});
