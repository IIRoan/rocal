import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import {
  activateSessionData,
  closeSessionData,
} from "../session-data-lifecycle";
import {
  captureNativeTitleIndexRequest,
  clearNativeTitleIndex,
  loadNativeTitleIndex,
  saveNativeTitleIndex,
  setNativeTitleIndexEnabled,
} from "./title-index-store";
import { mailToTitleIndexDocument } from "@workspace/calendar-core";

const mockFiles: Record<string, string> = {};
const mockKeys: Record<string, string> = {};
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///documents/",
  getInfoAsync: jest.fn(async (path: string) => ({
    exists: path in mockFiles,
  })),
  readAsStringAsync: jest.fn(async (path: string) => mockFiles[path]),
  writeAsStringAsync: jest.fn(async (path: string, value: string) => {
    mockFiles[path] = value;
  }),
  deleteAsync: jest.fn(async (path: string) => {
    delete mockFiles[path];
  }),
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockKeys[key] ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockKeys[key] = value;
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    delete mockKeys[key];
  }),
}));

function deferred() {
  let resolve = () => undefined as void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const documents = [
  mailToTitleIndexDocument({ id: "m1", subject: "Private fixture" }),
];

describe("native title index storage lifecycle", () => {
  beforeEach(async () => {
    await clearNativeTitleIndex();
    activateSessionData("u1");
    await setNativeTitleIndexEnabled(true);
    jest.clearAllMocks();
  });

  it("does not create a key for an absent read", async () => {
    expect(await loadNativeTitleIndex("u1")).toEqual([]);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it("removes a key whose creation was already in flight at close", async () => {
    const entered = deferred();
    const finish = deferred();
    jest
      .mocked(SecureStore.setItemAsync)
      .mockImplementationOnce(async (key, value) => {
        entered.resolve();
        await finish.promise;
        mockKeys[key] = value;
      });
    const write = saveNativeTitleIndex({ accountId: "u1", documents });
    await entered.promise;
    const closing = closeSessionData();
    finish.resolve();
    await Promise.all([write, closing]);
    expect(Object.keys(mockFiles)).toHaveLength(0);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
    expect(await loadNativeTitleIndex("u1")).toEqual([]);
  });

  it("waits for a physical write before removing its file", async () => {
    const entered = deferred();
    const finish = deferred();
    jest
      .mocked(FileSystem.writeAsStringAsync)
      .mockImplementationOnce(async (path, value) => {
        entered.resolve();
        await finish.promise;
        mockFiles[path] = value;
      });
    const write = saveNativeTitleIndex({ accountId: "u1", documents });
    await entered.promise;
    const closing = clearNativeTitleIndex();
    finish.resolve();
    await Promise.all([write, closing]);
    expect(Object.keys(mockFiles)).toHaveLength(0);
  });

  it("rejects old collection after same-account sign-in and permits a new collection", async () => {
    const request = captureNativeTitleIndexRequest("u1");
    await closeSessionData();
    activateSessionData("u1");
    expect(
      await saveNativeTitleIndex({ accountId: "u1", documents, request }),
    ).toBe(false);
    expect(await saveNativeTitleIndex({ accountId: "u1", documents })).toBe(
      true,
    );
    expect(await loadNativeTitleIndex("u1")).toEqual(documents);
  });

  it("invalidates before waiting for disable persistence, then allows re-enable", async () => {
    const request = captureNativeTitleIndexRequest("u1");
    const disabling = setNativeTitleIndexEnabled(false);
    expect(request.isCurrent()).toBe(false);
    await disabling;
    expect(await saveNativeTitleIndex({ accountId: "u1", documents })).toBe(
      false,
    );
    await setNativeTitleIndexEnabled(true);
    expect(await saveNativeTitleIndex({ accountId: "u1", documents })).toBe(
      true,
    );
  });

  it("attempts key deletion after file deletion fails and retries cleanup before saving", async () => {
    await saveNativeTitleIndex({ accountId: "u1", documents });
    jest
      .mocked(FileSystem.deleteAsync)
      .mockRejectedValueOnce(new Error("disk busy"));
    await expect(clearNativeTitleIndex()).rejects.toThrow("cleanup");
    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
    expect(await saveNativeTitleIndex({ accountId: "u1", documents })).toBe(
      true,
    );
    expect(await loadNativeTitleIndex("u1")).toEqual(documents);
  });
});
