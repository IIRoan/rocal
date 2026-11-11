import * as FileSystem from "expo-file-system/legacy";
import {
  activateSessionData,
  closeSessionData,
  captureSessionDataScope,
} from "@workspace/native-core/lib/session-data-lifecycle";
import type { MailOfflineSnapshot } from "./mail-offline-snapshot";
import {
  clearMailOfflineSnapshot,
  loadMailOfflineSnapshot,
  saveMailOfflineSnapshot,
} from "./mail-offline-store";

const mockSecureStore: Record<string, string> = {};
const mockFiles: Record<string, string> = {};

jest.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStore[key] = value;
  }),
  getItemAsync: jest.fn(async (key: string) => mockSecureStore[key] ?? null),
  deleteItemAsync: jest.fn(async (key: string) => {
    delete mockSecureStore[key];
  }),
}));

jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  getInfoAsync: jest.fn(async (path: string) => ({ exists: path in mockFiles })),
  readAsStringAsync: jest.fn(async (path: string) => mockFiles[path]),
  writeAsStringAsync: jest.fn(async (path: string, value: string) => {
    mockFiles[path] = value;
  }),
  deleteAsync: jest.fn(async (path: string) => {
    delete mockFiles[path];
  }),
}));

jest.mock("./mail-api", () => ({
  createServerMailTokenManager: jest.fn(),
  getMailConfig: jest.fn(),
  mailFetch: jest.fn(),
}));

function snapshot(userId = "u1"): MailOfflineSnapshot {
  return {
    version: 2,
    userId,
    savedAt: 1,
    emailState: "s1",
    account: { email: "alice@solace.onl", displayName: null, provisioned: true },
    runtime: {
      config: {},
      session: { accounts: {}, primaryAccounts: {}, apiUrl: "" },
      accountId: "acc",
      mailboxes: [],
      identities: [],
      encryptedAtRest: false,
      mailServerPolicy: {},
    } as unknown as MailOfflineSnapshot["runtime"],
    lists: [
      {
        mailboxId: "inbox",
        total: 1,
        messages: [{ id: "m1", subject: "Quarterly salary review" }],
      },
    ],
    threads: [],
    decrypted: [
      {
        messageId: "m1",
        partial: false,
        result: {
          plaintext: "Decrypted salary numbers",
          signatureVerificationState: "not_signed",
          hasVerifiedSignature: false,
        },
      },
    ],
    labels: null,
  };
}

describe("mail offline store", () => {
  beforeEach(async () => {
    await clearMailOfflineSnapshot();
    activateSessionData("u1");
    for (const key of Object.keys(mockSecureStore)) delete mockSecureStore[key];
    for (const key of Object.keys(mockFiles)) delete mockFiles[key];
  });

  it("round-trips a snapshot and never writes plaintext to disk", async () => {
    await saveMailOfflineSnapshot(snapshot());

    const onDisk = Object.values(mockFiles).join("");
    expect(onDisk).not.toContain("Quarterly salary review");
    expect(onDisk).not.toContain("Decrypted salary numbers");
    expect(onDisk).not.toContain("alice@solace.onl");
    expect(await loadMailOfflineSnapshot("u1")).toEqual(snapshot());
  });

  it("refuses and wipes a snapshot written for another account", async () => {
    await saveMailOfflineSnapshot(snapshot("u1"));

    activateSessionData("u2");
    expect(await loadMailOfflineSnapshot("u2")).toBeNull();
    expect(Object.keys(mockFiles)).toHaveLength(0);
  });

  it("cannot be read once its key is gone", async () => {
    await saveMailOfflineSnapshot(snapshot());
    for (const key of Object.keys(mockSecureStore)) delete mockSecureStore[key];

    expect(await loadMailOfflineSnapshot("u1")).toBeNull();
    expect(Object.keys(mockFiles)).toHaveLength(0);
  });

  it("clear removes both the file and the key", async () => {
    await saveMailOfflineSnapshot(snapshot());
    await clearMailOfflineSnapshot();

    expect(Object.keys(mockFiles)).toHaveLength(0);
    expect(Object.keys(mockSecureStore)).toHaveLength(0);
    expect(await loadMailOfflineSnapshot("u1")).toBeNull();
  });

  it("drops a save that was still encrypting when the user signed out", async () => {
    const pending = saveMailOfflineSnapshot(snapshot());
    await clearMailOfflineSnapshot();
    await pending;

    expect(Object.keys(mockFiles)).toHaveLength(0);
  });
  it("ignores a debounced save captured before signing back into the same account", async () => {
    const scope = captureSessionDataScope("u1");
    await closeSessionData();
    activateSessionData("u1");
    await saveMailOfflineSnapshot(snapshot(), scope);
    expect(Object.keys(mockFiles)).toHaveLength(0);
    await saveMailOfflineSnapshot(snapshot());
    expect(await loadMailOfflineSnapshot("u1")).toEqual(snapshot());
  });

  it("clears a snapshot whose filesystem write was already running", async () => {
    let enter = () => undefined as void;
    let finish = () => undefined as void;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const released = new Promise<void>((resolve) => {
      finish = resolve;
    });
    jest
      .mocked(FileSystem.writeAsStringAsync)
      .mockImplementationOnce(async (path, value) => {
        enter();
        await released;
        mockFiles[path] = value;
      });
    const saving = saveMailOfflineSnapshot(snapshot());
    await entered;
    const clearing = clearMailOfflineSnapshot();
    finish();
    await Promise.all([saving, clearing]);
    expect(Object.keys(mockFiles)).toHaveLength(0);
  });
});
