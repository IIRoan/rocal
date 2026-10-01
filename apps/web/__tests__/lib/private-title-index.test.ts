import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  generateLocalSearchIndexKey,
  searchTitleIndex,
} from "@workspace/calendar-core";
import type { JmapEmailMessage, UserKeyVault } from "@/lib/mail/types";
import type { SearchShardRecord } from "@/lib/search/local-index-store";

let mockKey: CryptoKey;
let mockRecord: SearchShardRecord | null;
let mockMessages: JmapEmailMessage[];
jest.mock("@/lib/search/local-index-store", () => ({
  BrowserSearchIndexStore: class {
    async getOrCreateKey() {
      return mockKey;
    }
    async get() {
      return mockRecord;
    }
    async put(record: SearchShardRecord) {
      mockRecord = record;
    }
  },
  TITLE_INDEX_SHARD_ID: "title-index",
  titleIndexAdditionalData: (id: string) => `title-index:${id}`,
}));
jest.mock("@/lib/calendar-api-service", () => ({
  calendarApiService: {
    getEventSearchCorpus: async () => ({ events: [], nextOffset: null }),
  },
}));
jest.mock("@/lib/mail/jmap-client", () => ({
  StalwartJmapClient: class {
    async discoverSession() {
      return {};
    }
    async getMailboxes() {
      return [{ id: "inbox", name: "Inbox", role: "inbox" }];
    }
    async getMailboxMessageIds() {
      return { ids: mockMessages.map((m) => m.id), total: mockMessages.length };
    }
    async getMessagesByIds(_session: unknown, ids: string[]) {
      return mockMessages.filter((m) => ids.includes(m.id));
    }
  },
}));
jest.mock("@/lib/mail/oauth-client", () => ({
  createMailOAuthTokenManager: () => ({ getAccessToken: async () => "token" }),
}));
jest.mock("@/lib/mail/api-service", () => ({
  mailDemoApiService: {
    getConfig: async () => ({
      discoveryBaseUrl: "https://mail.example.test",
      oauth: {},
    }),
    getAccountVaultBackup: jest.fn(),
    getAccountStatus: jest.fn(),
  },
}));
jest.mock("@/lib/mail/worker-client", () => ({
  mailCryptoWorkerClient: { loadVault: jest.fn(), decryptMessage: jest.fn() },
}));
jest.mock("@/lib/mail/vault-crypto", () => ({
  unlockEncryptedMailVault: jest.fn(),
  unlockEncryptedMailVaultWithDerivedKey: jest.fn(),
}));
jest.mock("@/lib/mail/vault-secret", () => ({ unwrapVaultSecret: jest.fn() }));
jest.mock("@/lib/mail/derived-vault-key-storage", () => ({
  getStoredDerivedVaultKey: jest.fn(),
  putStoredDerivedVaultKey: jest.fn(),
}));

import { mailDemoApiService } from "@/lib/mail/api-service";
import { mailCryptoWorkerClient } from "@/lib/mail/worker-client";
import {
  unlockEncryptedMailVault,
  unlockEncryptedMailVaultWithDerivedKey,
} from "@/lib/mail/vault-crypto";
import { unwrapVaultSecret } from "@/lib/mail/vault-secret";
import { getStoredDerivedVaultKey } from "@/lib/mail/derived-vault-key-storage";
import {
  setActiveE2eeSession,
  clearActiveE2eeSession,
} from "@/lib/e2ee-session";
import { rebuildPrivateTitleIndex } from "@/lib/search/private-title-index";

const ARMOR = "-----BEGIN PGP MESSAGE-----\nabc\n-----END PGP MESSAGE-----";
const vault = {
  encryptedPrivateKeyArmored: "private",
  publicKeyArmored: "public",
} as UserKeyVault;

describe("web private body index", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockKey = await generateLocalSearchIndexKey();
    mockRecord = null;
    setActiveE2eeSession({
      userId: "u1",
      deviceId: "d1",
      accountKey: mockKey,
      blindIndexKey: mockKey,
      activatedAt: new Date(),
    });
    mockMessages = [
      {
        id: "plain",
        subject: "Plain",
        textBody: [{ partId: "t" }],
        bodyValues: { t: { value: "Readable" } },
      },
      {
        id: "encrypted",
        subject: "Encrypted",
        textBody: [{ partId: "t" }],
        bodyValues: { t: { value: ARMOR } },
      },
    ];
    jest.mocked(mailDemoApiService.getAccountVaultBackup).mockResolvedValue({
      email: "mail@example.test",
      vaultVersion: 1,
      encryptedVaultB64: "encrypted",
      kdf: "argon2id",
      kdfParams: {
        saltB64: "salt",
        memoryKiB: 8,
        iterations: 1,
        parallelism: 1,
      },
      wrappedSecret: "sealed",
    });
    jest.mocked(getStoredDerivedVaultKey).mockResolvedValue(null);
    jest.mocked(unwrapVaultSecret).mockResolvedValue("secret");
    jest.mocked(unlockEncryptedMailVault).mockResolvedValue(vault);
    jest
      .mocked(mailCryptoWorkerClient.loadVault)
      .mockResolvedValue({ fingerprint: "fingerprint" });
    jest.mocked(mailCryptoWorkerClient.decryptMessage).mockResolvedValue({
      plaintext:
        "Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\nPHA+WmVwcGVsaW4gcGxhbnM8L3A+",
      hasVerifiedSignature: false,
      signatureVerificationState: "not_signed",
    });
  });

  it("loads the vault on a fresh calendar visit before decrypting HTML-only mail", async () => {
    let releaseVault = () => {};
    let enteredVault = () => {};
    const entered = new Promise<void>((resolve) => {
      enteredVault = resolve;
    });
    jest.mocked(mailCryptoWorkerClient.loadVault).mockImplementationOnce(() => {
      enteredVault();
      return new Promise((resolve) => {
        releaseVault = () => resolve({ fingerprint: "fingerprint" });
      });
    });
    const pending = rebuildPrivateTitleIndex({ accountId: "u1" });
    await entered;
    expect(mailCryptoWorkerClient.decryptMessage).not.toHaveBeenCalled();
    releaseVault();
    const snapshot = await pending;
    expect(mailCryptoWorkerClient.loadVault).toHaveBeenCalledWith({
      privateKeyArmored: "private",
      publicKeyArmored: "public",
      privateKeyPassphrase: "secret",
    });
    expect(snapshot.pendingBodies).toBe(0);
    expect(searchTitleIndex(snapshot.documents, "zeppelin", 5)).toHaveLength(1);
    expect(snapshot.documents[1]?.body).toBe("Zeppelin plans");
  });

  it("leaves encrypted mail pending until the vault can be unlocked", async () => {
    jest.mocked(unwrapVaultSecret).mockResolvedValueOnce(null);
    const first = await rebuildPrivateTitleIndex({ accountId: "u1" });
    expect(first.pendingBodies).toBe(1);
    expect(first.loadedBodies).toBe(1);
    expect(first.documents[1]?.body).toBeUndefined();
    expect(mailCryptoWorkerClient.decryptMessage).not.toHaveBeenCalled();
    const second = await rebuildPrivateTitleIndex({ accountId: "u1" });
    expect(second.pendingBodies).toBe(0);
    expect(second.loadedBodies).toBe(1);
    expect(searchTitleIndex(second.documents, "zeppelin", 5)).toHaveLength(1);
  });

  it("does not load another account's vault without its encryption key", async () => {
    clearActiveE2eeSession();
    const snapshot = await rebuildPrivateTitleIndex({ accountId: "u1" });
    expect(snapshot.pendingBodies).toBe(1);
    expect(mailCryptoWorkerClient.loadVault).not.toHaveBeenCalled();
  });

  it("falls back to the sealed secret when a cached derived key is stale", async () => {
    jest.mocked(getStoredDerivedVaultKey).mockResolvedValue("stale-key");
    jest
      .mocked(unlockEncryptedMailVaultWithDerivedKey)
      .mockRejectedValue(new Error("Stale key"));
    const snapshot = await rebuildPrivateTitleIndex({ accountId: "u1" });
    expect(unlockEncryptedMailVault).toHaveBeenCalledWith(
      "encrypted",
      "secret",
      expect.any(Object),
      expect.any(Function),
    );
    expect(snapshot.pendingBodies).toBe(0);
  });

  it("does not load a vault if the account key is cleared during unlock", async () => {
    jest.mocked(unlockEncryptedMailVault).mockImplementationOnce(async () => {
      clearActiveE2eeSession();
      return vault;
    });
    const snapshot = await rebuildPrivateTitleIndex({ accountId: "u1" });
    expect(snapshot.pendingBodies).toBe(1);
    expect(mailCryptoWorkerClient.loadVault).not.toHaveBeenCalled();
    expect(mailCryptoWorkerClient.decryptMessage).not.toHaveBeenCalled();
  });
});
