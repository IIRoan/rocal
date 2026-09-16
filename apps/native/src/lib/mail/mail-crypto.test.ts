/**
 * Tests for mail-crypto.ts
 *
 * We mock:
 *  - native-vault-crypto (to avoid running a full argon2id derivation)
 *  - mail-password-cache (to control stored password)
 *  - mail-api (mailFetch — network calls)
 *  - openpgp (heavy PGP lib)
 *
 * This lets the tests run fast and focus on the orchestration logic:
 * candidate ordering, cache behaviour, error propagation, and logging.
 */

import { buildOutgoingMimeMessage } from "@workspace/calendar-core";
import {
  ensureVaultLoaded,
  decryptMailMessage,
  decryptPgpMimeMessage,
  clearVaultCache,
  isVaultLoaded,
  getLoadedVaultFingerprint,
  type MailDecryptResult,
} from "./mail-crypto";
import type { MailRuntime } from "./mail-runtime";

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("@workspace/logger", () => ({
  createLogger: () => ({
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  }),
}));

const mockMailFetch = jest.fn();
const mockUpsertAccountVaultBackup = jest.fn();
jest.mock("./mail-api", () => ({
  mailFetch: (...args: unknown[]) => mockMailFetch(...args),
  upsertAccountVaultBackup: (...args: unknown[]) =>
    mockUpsertAccountVaultBackup(...args),
}));

// Stub API_BASE_URL used by fetchVaultBackup
jest.mock("../constants", () => ({
  API_BASE_URL: "https://api.example.com",
  SECURE_STORE_KEYS: {
    MAIL_VAULT_PASSWORD: "MAIL_VAULT_PASSWORD",
    MAIL_VAULT_DERIVED_KEY: "MAIL_VAULT_DERIVED_KEY",
  },
}));

// Mock vault crypto with a fast in-memory implementation
const mockUnlockVault = jest.fn();
const mockUnlockVaultWithDerivedKey = jest.fn();
const mockCreateEncryptedMailVault = jest.fn();
const mockWrapVaultSecret = jest.fn(
  async (secret: string): Promise<string | null> => `wrapped:${secret}`,
);
const mockUnwrapVaultSecret = jest.fn(
  async (wrapped: string): Promise<string | null> =>
    wrapped.replace(/^wrapped:/, ""),
);

jest.mock("./vault-secret", () => ({
  VAULT_WRAP_ALGORITHM: "e2ee-account-key-v1",
  generateVaultSecret: () => "sealed-secret",
  wrapVaultSecret: (secret: string) => mockWrapVaultSecret(secret),
  unwrapVaultSecret: (wrapped: string) => mockUnwrapVaultSecret(wrapped),
}));

jest.mock("./native-vault-crypto", () => {
  const actual = jest.requireActual("./native-vault-crypto") as typeof import("./native-vault-crypto");
  return {
    ...actual,
    unlockEncryptedMailVault: (...args: unknown[]) => mockUnlockVault(...args),
    unlockEncryptedMailVaultWithDerivedKey: (...args: unknown[]) =>
      mockUnlockVaultWithDerivedKey(...args),
    createEncryptedMailVault: (...args: unknown[]) =>
      mockCreateEncryptedMailVault(...args),
  };
});

// Control stored password + derived key + cached private key
const mockLoadMailVaultPassword = jest.fn<Promise<string | null>, []>();
const mockLoadDerivedVaultKey = jest.fn<Promise<string | null>, []>();
const mockSaveDerivedVaultKey = jest.fn();
const mockLoadCachedPrivateKey = jest.fn<Promise<string | null>, []>();
const mockSaveCachedPrivateKey = jest.fn();
jest.mock("./mail-password-cache", () => ({
  loadMailVaultPassword: () => mockLoadMailVaultPassword(),
  saveMailVaultPassword: jest.fn(),
  clearMailVaultPassword: jest.fn(),
  loadDerivedVaultKey: () => mockLoadDerivedVaultKey(),
  saveDerivedVaultKey: (...args: unknown[]) => mockSaveDerivedVaultKey(...args),
  clearDerivedVaultKey: jest.fn(),
  loadCachedPrivateKey: () => mockLoadCachedPrivateKey(),
  saveCachedPrivateKey: (...args: unknown[]) => mockSaveCachedPrivateKey(...args),
  clearCachedPrivateKey: jest.fn(),
}));

// Stub openpgp so tests are fast and deterministic
const mockReadMessage = jest.fn();
const mockReadPrivateKey = jest.fn();
const mockDecryptKey = jest.fn();
const mockEncryptKey = jest.fn();
const mockDecrypt = jest.fn();
const mockReadKey = jest.fn();
jest.mock("openpgp", () => ({
  readMessage: (...args: unknown[]) => mockReadMessage(...args),
  readPrivateKey: (...args: unknown[]) => mockReadPrivateKey(...args),
  decryptKey: (...args: unknown[]) => mockDecryptKey(...args),
  encryptKey: (...args: unknown[]) => mockEncryptKey(...args),
  decrypt: (...args: unknown[]) => mockDecrypt(...args),
  readKey: (...args: unknown[]) => mockReadKey(...args),
}));

// Stub mail-mime-parser
const mockParseMimeBody = jest.fn();
jest.mock("./mail-mime-parser", () => ({
  parseMimeBody: (...args: unknown[]) => mockParseMimeBody(...args),
}));

// Allow overriding extractPgpMimeCiphertextBlobId per test
const mockExtractBlobId = jest.fn<string | null, [unknown]>();
jest.mock("./message-security", () => ({
  ...jest.requireActual("./message-security"),
  extractPgpMimeCiphertextBlobId: (arg: unknown) => mockExtractBlobId(arg),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MOCK_VAULT_BACKUP = {
  email: "alice@example.com",
  vaultVersion: 1,
  encryptedVaultB64: "base64encodedvault==",
  kdf: "argon2id",
  kdfParams: {
    saltB64: "abc123==",
    memoryKiB: 65536,
    iterations: 3,
    parallelism: 4,
  },
};

const MOCK_SAFE_VAULT_BACKUP = {
  ...MOCK_VAULT_BACKUP,
  kdfParams: {
    saltB64: "safe123==",
    memoryKiB: 8192,
    iterations: 1,
    parallelism: 1,
  },
};

const MOCK_KEY_MATERIAL = "server-derived-key-material-xyz";
const MOCK_DERIVED_KEY_B64 = "ZGVyaXZlZGtleWJ5dGVzYmFzZTY0dXJsZW5jb2RlZA==";

const MOCK_VAULT = {
  userId: "user-1",
  email: "alice@example.com",
  publicKeyArmored: "-----BEGIN PGP PUBLIC KEY BLOCK-----",
  publicKeyFingerprint: "AABBCCDDEE",
  encryptedPrivateKeyArmored: "-----BEGIN PGP PRIVATE KEY BLOCK-----",
  kdf: "argon2id",
  kdfParams: MOCK_VAULT_BACKUP.kdfParams,
  vaultVersion: 1,
  createdAt: "2025-01-01T00:00:00.000Z",
};

const MOCK_PRIVATE_KEY = {
  isDecrypted: () => false,
} as any;

const MOCK_DECRYPTED_KEY = {
  isDecrypted: () => true,
  armor: () => "-----BEGIN PGP PRIVATE KEY BLOCK-----\nDecryptedKey\n-----END PGP PRIVATE KEY BLOCK-----",
  getFingerprint: () => MOCK_VAULT.publicKeyFingerprint.toLowerCase(),
} as any;

import { resolveMailServerPolicy } from "@workspace/calendar-core";

const mockGetBlobAsText = jest.fn();

function buildRuntime(overrides?: Partial<MailRuntime["config"]>): MailRuntime {
  return {
    config: {
      defaultDomain: "example.com",
      discoveryBaseUrl: "https://mail.example.com",
      signupEnabled: true,
      oauth: {} as any,
      ...overrides,
    },
    client: {
      getBlobAsText: (...args: unknown[]) => mockGetBlobAsText(...args),
    } as any,
    session: {} as any,
    accountId: "account-1",
    mailboxes: [],
    identities: [],
    pickerIdentities: [],
    encryptedAtRest: false,
    mailServerPolicy: resolveMailServerPolicy({}),
  };
}

function mockSuccessfulVaultLoad() {
  // Backend: a vault sealed to the owner's account key.
  mockMailFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      ...MOCK_VAULT_BACKUP,
      wrappedSecret: "wrapped:sealed-secret",
      wrapAlgorithm: "e2ee-account-key-v1",
    }),
  });
  mockUnlockVault.mockResolvedValueOnce(MOCK_VAULT);
  // PGP private key
  mockReadPrivateKey.mockResolvedValueOnce(MOCK_PRIVATE_KEY);
  mockDecryptKey.mockResolvedValueOnce(MOCK_DECRYPTED_KEY);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

/** Pre-handled so an unconsumed fixture can never surface as an unhandled rejection. */
function rejectedSignature(message: string): Promise<boolean> {
  const rejected = Promise.reject(new Error(message));
  rejected.catch(() => undefined);
  return rejected;
}

describe("mail-crypto", () => {
  beforeEach(() => {
    clearVaultCache();
    // resetAllMocks clears mock implementations AND the once-queue
    jest.resetAllMocks();
    mockWrapVaultSecret.mockImplementation(async (secret) => `wrapped:${secret}`);
    mockUnwrapVaultSecret.mockImplementation(async (wrapped) =>
      wrapped.replace(/^wrapped:/, ""),
    );
    mockLoadMailVaultPassword.mockResolvedValue(null);
    mockLoadDerivedVaultKey.mockResolvedValue(null);
    mockSaveDerivedVaultKey.mockResolvedValue(undefined);
    mockLoadCachedPrivateKey.mockResolvedValue(null);
    mockSaveCachedPrivateKey.mockResolvedValue(undefined);
    mockUpsertAccountVaultBackup.mockResolvedValue(undefined);
    mockCreateEncryptedMailVault.mockResolvedValue({
      encryptedVaultB64: "migrated-vault-b64",
      kdf: "argon2id",
      kdfParams: {
        saltB64: "migrated-salt",
        memoryKiB: 8192,
        iterations: 1,
        parallelism: 1,
      },
    });
    mockEncryptKey.mockResolvedValue({
      armor: () => "-----BEGIN PGP PRIVATE KEY BLOCK-----\nReEncrypted\n-----END PGP PRIVATE KEY BLOCK-----",
    });
    mockExtractBlobId.mockReturnValue(null);
    mockParseMimeBody.mockReturnValue({ text: null, html: null });
  });

  // ── ensureVaultLoaded ──────────────────────────────────────────────────────

  describe("ensureVaultLoaded", () => {
    it("opens a sealed vault with the unwrapped secret", async () => {
      mockSuccessfulVaultLoad();

      const runtime = buildRuntime();
      await ensureVaultLoaded(runtime);

      expect(mockUnwrapVaultSecret).toHaveBeenCalledWith(
        "wrapped:sealed-secret",
      );
      expect(mockUnlockVault).toHaveBeenCalledWith(
        MOCK_VAULT_BACKUP.encryptedVaultB64,
        "sealed-secret",
        MOCK_VAULT_BACKUP.kdfParams,
        expect.any(Function),
      );
      // Only the vault backup is fetched; no server key material exists.
      expect(mockMailFetch).toHaveBeenCalledTimes(1);
    });

    it("refuses a vault the server could still open", async () => {
      mockMailFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_VAULT_BACKUP,
      });

      const runtime = buildRuntime();
      await expect(ensureVaultLoaded(runtime)).rejects.toThrow(
        "could not be unlocked",
      );
      expect(mockUnlockVault).not.toHaveBeenCalled();
    });

    it("refuses when the secret cannot be unsealed on this device", async () => {
      mockMailFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...MOCK_VAULT_BACKUP,
          wrappedSecret: "wrapped:sealed-secret",
        }),
      });
      mockUnwrapVaultSecret.mockResolvedValueOnce(null);

      const runtime = buildRuntime();
      await expect(ensureVaultLoaded(runtime)).rejects.toThrow(
        "could not be unlocked",
      );
      expect(mockUnlockVault).not.toHaveBeenCalled();
    });

    it("skips S2K when a valid decrypted private key is found in SecureStore cache", async () => {
      mockSuccessfulVaultLoad();
      mockLoadCachedPrivateKey.mockResolvedValueOnce(
        MOCK_DECRYPTED_KEY.armor(),
      );
      mockReadPrivateKey.mockResolvedValueOnce(MOCK_DECRYPTED_KEY);

      const runtime = buildRuntime();
      await ensureVaultLoaded(runtime);

      expect(mockDecryptKey).not.toHaveBeenCalled();
    });

    it("throws when vault backup is unavailable", async () => {
      mockMailFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "Not Found",
      });

      const runtime = buildRuntime();
      await expect(ensureVaultLoaded(runtime)).rejects.toThrow(/vault backup/i);
    });

    it("returns the cached vault on repeated calls (does not re-fetch)", async () => {
      mockSuccessfulVaultLoad();
      const runtime = buildRuntime();

      const v1 = await ensureVaultLoaded(runtime);
      const v2 = await ensureVaultLoaded(runtime);

      expect(v1).toBe(v2);
      // Only the vault backup is fetched; no server key material exists.
      expect(mockMailFetch).toHaveBeenCalledTimes(1);
    });

    it("opens a sealed vault without asking the server for key material", async () => {
      mockMailFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...MOCK_SAFE_VAULT_BACKUP,
          wrappedSecret: "wrapped:sealed-secret",
          wrapAlgorithm: "e2ee-account-key-v1",
        }),
      });
      mockUnlockVault.mockResolvedValueOnce(MOCK_VAULT);
      mockReadPrivateKey.mockResolvedValueOnce(MOCK_PRIVATE_KEY);
      mockDecryptKey.mockResolvedValueOnce(MOCK_DECRYPTED_KEY);

      const runtime = buildRuntime();
      await ensureVaultLoaded(runtime);

      expect(mockUnwrapVaultSecret).toHaveBeenCalledWith(
        "wrapped:sealed-secret",
      );
      expect(mockUnlockVault).toHaveBeenCalledWith(
        MOCK_SAFE_VAULT_BACKUP.encryptedVaultB64,
        "sealed-secret",
        MOCK_SAFE_VAULT_BACKUP.kdfParams,
        expect.any(Function),
      );
      // Only the vault backup was fetched — no key-material request at all.
      expect(mockMailFetch).toHaveBeenCalledTimes(1);
      expect(mockUpsertAccountVaultBackup).not.toHaveBeenCalled();
    });
  });

  // ─── decryptMailMessage ────────────────────────────────────────────────────

  describe("decryptMailMessage", () => {
    beforeEach(() => {
      mockSuccessfulVaultLoad();
    });

    it("decrypts a PGP message successfully", async () => {
      const mockMessage = {};
      mockReadMessage.mockResolvedValueOnce(mockMessage);
      mockDecrypt.mockResolvedValueOnce({
        data: "Decrypted content",
        signatures: [],
      });

      const runtime = buildRuntime();
      const result: MailDecryptResult = await decryptMailMessage(
        runtime,
        "msg-001",
        "-----BEGIN PGP MESSAGE-----\n...",
      );

      expect(result.plaintext).toBe("Decrypted content");
      expect(result.signatureVerificationState).toBe("not_signed");
      expect(result.hasVerifiedSignature).toBe(false);
    });

    it("extracts html from decrypted inline MIME payloads", async () => {
      const mime = buildOutgoingMimeMessage({
        text: "Hello world",
        html: "<p>Hello <strong>world</strong></p>",
      });
      mockReadMessage.mockResolvedValueOnce({});
      mockDecrypt.mockResolvedValueOnce({
        data: mime,
        signatures: [],
      });
      mockParseMimeBody.mockImplementationOnce(
        jest.requireActual("./mail-mime-parser").parseMimeBody,
      );

      const runtime = buildRuntime();
      const result = await decryptMailMessage(
        runtime,
        "msg-inline-html",
        "-----BEGIN PGP MESSAGE-----",
      );

      expect(result.plaintext).toBe("Hello world");
      expect(result.html).toBe("<p>Hello <strong>world</strong></p>");
    });

    it("reports unverified signature when no sender key is provided", async () => {
      mockReadMessage.mockResolvedValueOnce({});
      mockDecrypt.mockResolvedValueOnce({
        data: "Hello",
        signatures: [{ verified: Promise.resolve(true) }],
      });

      const runtime = buildRuntime();
      const result = await decryptMailMessage(
        runtime,
        "msg-002",
        "-----BEGIN PGP MESSAGE-----",
      );
      expect(result.signatureVerificationState).toBe("unverified");
    });

    it("reports verified signature when sender key is provided and verification passes", async () => {
      const senderKey = {};
      mockReadMessage.mockResolvedValueOnce({});
      mockReadKey.mockResolvedValueOnce(senderKey);
      mockDecrypt.mockResolvedValueOnce({
        data: "Signed content",
        signatures: [{ verified: Promise.resolve(true) }],
      });

      const runtime = buildRuntime();
      const result = await decryptMailMessage(
        runtime,
        "msg-003",
        "-----BEGIN PGP MESSAGE-----",
        "-----BEGIN PGP PUBLIC KEY BLOCK-----",
      );
      expect(result.signatureVerificationState).toBe("verified");
      expect(result.hasVerifiedSignature).toBe(true);
    });

    it("reports failed signature when verification throws", async () => {
      const senderKey = {};
      mockReadMessage.mockResolvedValueOnce({});
      mockReadKey.mockResolvedValueOnce(senderKey);
      mockDecrypt.mockResolvedValueOnce({
        data: "Bad sig",
        signatures: [{ verified: rejectedSignature("sig invalid") }],
      });

      const runtime = buildRuntime();
      const result = await decryptMailMessage(
        runtime,
        "msg-004",
        "-----BEGIN PGP MESSAGE-----",
        "-----BEGIN PGP PUBLIC KEY BLOCK-----",
      );
      expect(result.signatureVerificationState).toBe("failed");
    });

    it("verifies signatures on intermediate PGP layers before peeling further", async () => {
      const nestedInner = [
        "-----BEGIN PGP MESSAGE-----",
        "inner-ciphertext",
        "-----END PGP MESSAGE-----",
      ].join("\n");
      const senderKey = {};

      mockReadMessage
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});
      mockReadKey.mockResolvedValueOnce(senderKey);
      mockDecrypt
        .mockResolvedValueOnce({
          data: nestedInner,
          signatures: [{ verified: Promise.resolve(true) }],
        })
        .mockResolvedValueOnce({
          data: "Final plaintext",
          signatures: [],
        });

      const runtime = buildRuntime();
      const result = await decryptMailMessage(
        runtime,
        "msg-nested-sig",
        "-----BEGIN PGP MESSAGE-----",
        "-----BEGIN PGP PUBLIC KEY BLOCK-----",
      );

      expect(mockDecrypt).toHaveBeenCalledTimes(2);
      expect(result.plaintext).toBe("Final plaintext");
      expect(result.signatureVerificationState).toBe("verified");
      expect(result.hasVerifiedSignature).toBe(true);
    });

    it("handles Uint8Array data from openpgp.decrypt", async () => {
      const encoder = new TextEncoder();
      mockReadMessage.mockResolvedValueOnce({});
      mockDecrypt.mockResolvedValueOnce({
        data: encoder.encode("Binary content"),
        signatures: [],
      });

      const runtime = buildRuntime();
      const result = await decryptMailMessage(
        runtime,
        "msg-005",
        "-----BEGIN PGP MESSAGE-----",
      );
      expect(result.plaintext).toBe("Binary content");
    });

    it("throws and propagates errors from ensureVaultLoaded", async () => {
      // Override beforeEach setup — test a failure path
      jest.resetAllMocks();
      mockWrapVaultSecret.mockImplementation(async (secret) => `wrapped:${secret}`);
    mockUnwrapVaultSecret.mockImplementation(async (wrapped) =>
      wrapped.replace(/^wrapped:/, ""),
    );
    mockLoadMailVaultPassword.mockResolvedValue(null);
      mockLoadDerivedVaultKey.mockResolvedValue(null);
      mockSaveDerivedVaultKey.mockResolvedValue(undefined);

      mockMailFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => "Service unavailable",
      });

      const runtime = buildRuntime();
      await expect(
        decryptMailMessage(runtime, "msg-006", "-----BEGIN PGP MESSAGE-----"),
      ).rejects.toThrow(/vault backup/i);
    });
  });

  // ── isVaultLoaded / getLoadedVaultFingerprint ──────────────────────────────

  describe("isVaultLoaded / getLoadedVaultFingerprint", () => {
    it("returns false and null before loading", () => {
      expect(isVaultLoaded()).toBe(false);
      expect(getLoadedVaultFingerprint()).toBeNull();
    });

    it("returns true and the fingerprint after loading", async () => {
      mockSuccessfulVaultLoad();
      const runtime = buildRuntime();
      await ensureVaultLoaded(runtime);

      expect(isVaultLoaded()).toBe(true);
      expect(getLoadedVaultFingerprint()).toBe(MOCK_VAULT.publicKeyFingerprint);
    });

    it("returns false and null after clearVaultCache", async () => {
      mockSuccessfulVaultLoad();
      const runtime = buildRuntime();
      await ensureVaultLoaded(runtime);

      clearVaultCache();
      expect(isVaultLoaded()).toBe(false);
      expect(getLoadedVaultFingerprint()).toBeNull();
    });
  });

  // ── decryptPgpMimeMessage ──────────────────────────────────────────────────

  describe("decryptPgpMimeMessage", () => {
    beforeEach(() => {
      mockSuccessfulVaultLoad();
    });

    const MOCK_BODY_STRUCTURE = {
      type: "multipart/encrypted",
      subParts: [
        { type: "application/pgp-encrypted" },
        { type: "application/octet-stream", blobId: "blob-abc-123" },
      ],
    };

    it("fetches blob, decrypts PGP, and parses MIME", async () => {
      const armoredCiphertext = "-----BEGIN PGP MESSAGE-----\nFakeData\n-----END PGP MESSAGE-----";
      mockExtractBlobId.mockReturnValue("blob-abc-123");
      mockGetBlobAsText.mockResolvedValueOnce(armoredCiphertext);
      mockReadMessage.mockResolvedValueOnce({});
      mockDecrypt.mockResolvedValueOnce({ data: "Content-Type: text/plain\r\n\r\nHello MIME world", signatures: [] });
      mockParseMimeBody.mockReturnValueOnce({
        text: "Hello MIME world",
        html: null,
        attachments: [],
      });

      const runtime = buildRuntime();
      const result = await decryptPgpMimeMessage(runtime, "msg-mime-001", MOCK_BODY_STRUCTURE as any);

      expect(mockExtractBlobId).toHaveBeenCalledWith(MOCK_BODY_STRUCTURE);
      expect(mockGetBlobAsText).toHaveBeenCalled();
      expect(mockReadMessage).toHaveBeenCalledWith({ armoredMessage: armoredCiphertext });
      expect(mockParseMimeBody).toHaveBeenCalled();
      expect(result.plaintext).toBe("Hello MIME world");
      expect(result.html).toBeNull();
      expect(result.attachments).toEqual([]);
      expect(result.signatureVerificationState).toBe("not_signed");
    });

    it("returns HTML when MIME parser finds an HTML body", async () => {
      mockExtractBlobId.mockReturnValue("blob-xyz");
      mockGetBlobAsText.mockResolvedValueOnce("-----BEGIN PGP MESSAGE-----");
      mockReadMessage.mockResolvedValueOnce({});
      mockDecrypt.mockResolvedValueOnce({ data: "mime-payload", signatures: [] });
      mockParseMimeBody.mockReturnValueOnce({
        text: "plain text",
        html: "<p>HTML content</p>",
        attachments: [],
      });

      const runtime = buildRuntime();
      const result = await decryptPgpMimeMessage(runtime, "msg-mime-002", MOCK_BODY_STRUCTURE as any);

      expect(result.plaintext).toBe("plain text");
      expect(result.html).toBe("<p>HTML content</p>");
    });

    it("falls back to raw plaintext when MIME parser throws", async () => {
      mockExtractBlobId.mockReturnValue("blob-xyz");
      mockGetBlobAsText.mockResolvedValueOnce("-----BEGIN PGP MESSAGE-----");
      mockReadMessage.mockResolvedValueOnce({});
      mockDecrypt.mockResolvedValueOnce({ data: "raw decrypted content", signatures: [] });
      mockParseMimeBody.mockImplementationOnce(() => { throw new Error("MIME parse error"); });

      const runtime = buildRuntime();
      const result = await decryptPgpMimeMessage(runtime, "msg-mime-003", MOCK_BODY_STRUCTURE as any);

      expect(result.plaintext).toBe("raw decrypted content");
      expect(result.attachments).toEqual([]);
    });

    it("throws when ciphertext blobId cannot be located", async () => {
      mockExtractBlobId.mockReturnValue(null);

      const runtime = buildRuntime();
      await expect(
        decryptPgpMimeMessage(runtime, "msg-mime-004", MOCK_BODY_STRUCTURE as any),
      ).rejects.toThrow(/ciphertext blob/i);
    });

    it("throws when blob fetch fails", async () => {
      mockExtractBlobId.mockReturnValue("blob-xyz");
      mockGetBlobAsText.mockRejectedValueOnce(new Error("Network timeout"));

      const runtime = buildRuntime();
      await expect(
        decryptPgpMimeMessage(runtime, "msg-mime-005", MOCK_BODY_STRUCTURE as any),
      ).rejects.toThrow(/Network timeout/);
    });
  });
});
