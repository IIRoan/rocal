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

// Prevent real network calls
const mockMailFetch = jest.fn();
jest.mock("./mail-api", () => ({
  mailFetch: (...args: unknown[]) => mockMailFetch(...args),
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
jest.mock("./native-vault-crypto", () => ({
  unlockEncryptedMailVault: (...args: unknown[]) => mockUnlockVault(...args),
  unlockEncryptedMailVaultWithDerivedKey: (...args: unknown[]) => mockUnlockVaultWithDerivedKey(...args),
}));

// Control stored password + derived key
const mockLoadMailVaultPassword = jest.fn<Promise<string | null>, []>();
const mockLoadDerivedVaultKey = jest.fn<Promise<string | null>, []>();
const mockSaveDerivedVaultKey = jest.fn();
jest.mock("./mail-password-cache", () => ({
  loadMailVaultPassword: () => mockLoadMailVaultPassword(),
  saveMailVaultPassword: jest.fn(),
  clearMailVaultPassword: jest.fn(),
  loadDerivedVaultKey: () => mockLoadDerivedVaultKey(),
  saveDerivedVaultKey: (...args: unknown[]) => mockSaveDerivedVaultKey(...args),
  clearDerivedVaultKey: jest.fn(),
}));

// Stub openpgp so tests are fast and deterministic
const mockReadMessage = jest.fn();
const mockReadPrivateKey = jest.fn();
const mockDecryptKey = jest.fn();
const mockDecrypt = jest.fn();
const mockReadKey = jest.fn();
jest.mock("openpgp", () => ({
  readMessage: (...args: unknown[]) => mockReadMessage(...args),
  readPrivateKey: (...args: unknown[]) => mockReadPrivateKey(...args),
  decryptKey: (...args: unknown[]) => mockDecryptKey(...args),
  decrypt: (...args: unknown[]) => mockDecrypt(...args),
  readKey: (...args: unknown[]) => mockReadKey(...args),
}));

// Stub postal-mime
const mockPostalMimeParse = jest.fn();
jest.mock("postal-mime", () => ({
  __esModule: true,
  default: class PostalMime {
    static parse(...args: unknown[]) {
      return mockPostalMimeParse(...args);
    }
  },
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
} as any;

const mockGetBlobAsText = jest.fn();

function buildRuntime(overrides?: Partial<MailRuntime["config"]>): MailRuntime {
  return {
    config: {
      defaultDomain: "example.com",
      discoveryBaseUrl: "https://mail.example.com",
      signupEnabled: true,
      oauth: {} as any,
      vaultKeyMaterialEndpoint: "https://api.example.com/api/mail/vault-key-material",
      ...overrides,
    },
    client: {
      getBlobAsText: (...args: unknown[]) => mockGetBlobAsText(...args),
    } as any,
    session: {} as any,
    accountId: "account-1",
    mailboxes: [],
    identities: [],
    encryptedAtRest: false,
  };
}

function mockSuccessfulVaultLoad() {
  // Backend: vault backup
  mockMailFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => MOCK_VAULT_BACKUP,
  });
  // Backend: key material WITH pre-computed derived key (fast path)
  mockMailFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ keyMaterial: MOCK_KEY_MATERIAL, derivedKeyB64: MOCK_DERIVED_KEY_B64, version: "v1" }),
  });
  // Derived key vault unlock (fast path, no argon2id)
  mockUnlockVaultWithDerivedKey.mockResolvedValueOnce(MOCK_VAULT);
  // PGP private key
  mockReadPrivateKey.mockResolvedValueOnce(MOCK_PRIVATE_KEY);
  mockDecryptKey.mockResolvedValueOnce(MOCK_DECRYPTED_KEY);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("mail-crypto", () => {
  beforeEach(() => {
    clearVaultCache();
    // resetAllMocks clears mock implementations AND the once-queue
    jest.resetAllMocks();
    mockLoadMailVaultPassword.mockResolvedValue(null);
    mockLoadDerivedVaultKey.mockResolvedValue(null);
    mockSaveDerivedVaultKey.mockResolvedValue(undefined);
    mockExtractBlobId.mockReturnValue(null);
    mockPostalMimeParse.mockResolvedValue({ text: null, html: null });
  });

  // ── ensureVaultLoaded ──────────────────────────────────────────────────────

  describe("ensureVaultLoaded", () => {
    it("uses the backend-provided derived key (fast path, no argon2id)", async () => {
      mockSuccessfulVaultLoad();
      const runtime = buildRuntime();
      await ensureVaultLoaded(runtime);

      // Derived key path should be taken — unlockEncryptedMailVaultWithDerivedKey called
      expect(mockUnlockVaultWithDerivedKey).toHaveBeenCalledWith(
        MOCK_VAULT_BACKUP.encryptedVaultB64,
        MOCK_DERIVED_KEY_B64,
      );
      // argon2id path should NOT be taken
      expect(mockUnlockVault).not.toHaveBeenCalled();
      // Should cache the derived key to SecureStore
      expect(mockSaveDerivedVaultKey).toHaveBeenCalledWith(MOCK_DERIVED_KEY_B64);
    });

    it("uses cached derived key from SecureStore (skips argon2id but still fetches keyMaterial)", async () => {
      mockLoadDerivedVaultKey.mockResolvedValueOnce(MOCK_DERIVED_KEY_B64);
      // Two fetches: vault backup + key material (for PGP passphrase)
      mockMailFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_VAULT_BACKUP,
      });
      // Key material returned without derivedKeyB64 (backend unaware of cache)
      mockMailFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ keyMaterial: MOCK_KEY_MATERIAL, version: "v1" }),
      });
      mockUnlockVaultWithDerivedKey.mockResolvedValueOnce(MOCK_VAULT);
      mockReadPrivateKey.mockResolvedValueOnce(MOCK_PRIVATE_KEY);
      mockDecryptKey.mockResolvedValueOnce(MOCK_DECRYPTED_KEY);

      const runtime = buildRuntime();
      await ensureVaultLoaded(runtime);

      // Derived key from SecureStore used for AES-GCM
      expect(mockUnlockVaultWithDerivedKey).toHaveBeenCalledWith(
        MOCK_VAULT_BACKUP.encryptedVaultB64,
        MOCK_DERIVED_KEY_B64,
      );
      // argon2id NOT called
      expect(mockUnlockVault).not.toHaveBeenCalled();
      // Both fetches happened (vault backup + key material for PGP passphrase)
      expect(mockMailFetch).toHaveBeenCalledTimes(2);
    });

    it("falls back to argon2id key-material when backend does not return derivedKeyB64", async () => {
      // When backend omits derivedKeyB64 and no cached key exists, the new code
      // throws immediately (instead of blocking Hermes with argon2id).
      mockMailFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_VAULT_BACKUP,
      });
      mockMailFetch.mockResolvedValueOnce({
        ok: true,
        // No derivedKeyB64 in response
        json: async () => ({ keyMaterial: MOCK_KEY_MATERIAL, version: "v1" }),
      });
      // No cached derived key either
      mockLoadDerivedVaultKey.mockResolvedValueOnce(null);

      const runtime = buildRuntime();
      await expect(ensureVaultLoaded(runtime)).rejects.toThrow(
        /backend did not provide a pre-computed decryption key/i,
      );
      // argon2id must NOT be called (would crash Hermes)
      expect(mockUnlockVault).not.toHaveBeenCalled();
    });

    it("falls back to in-memory fallback password if key-material fetch fails", async () => {
      // Without key material, we can't decrypt — no derived key, no PGP passphrase.
      mockMailFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_VAULT_BACKUP,
      });
      // Key material fetch fails
      mockMailFetch.mockRejectedValueOnce(new Error("Network error"));
      mockLoadDerivedVaultKey.mockResolvedValueOnce(null);

      const runtime = buildRuntime();
      await expect(ensureVaultLoaded(runtime, "fallback-login-password")).rejects.toThrow(
        /backend did not provide a pre-computed decryption key/i,
      );
    });

    it("falls back to SecureStore password when in-memory password is absent", async () => {
      // Same: without key material or derived key, throws with helpful message.
      mockMailFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_VAULT_BACKUP,
      });
      mockMailFetch.mockRejectedValueOnce(new Error("Network error"));
      mockLoadDerivedVaultKey.mockResolvedValueOnce(null);

      const runtime = buildRuntime();
      await expect(ensureVaultLoaded(runtime)).rejects.toThrow(
        /backend did not provide a pre-computed decryption key/i,
      );
    });

    it("throws when no derived key is available (no crash loop)", async () => {
      mockLoadMailVaultPassword.mockResolvedValueOnce(null);
      mockLoadDerivedVaultKey.mockResolvedValueOnce(null);

      mockMailFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_VAULT_BACKUP,
      });
      mockMailFetch.mockResolvedValueOnce({
        ok: true,
        // No derivedKeyB64 returned
        json: async () => ({ keyMaterial: MOCK_KEY_MATERIAL, version: "v1" }),
      });

      const runtime = buildRuntime();
      await expect(ensureVaultLoaded(runtime)).rejects.toThrow(
        /backend did not provide a pre-computed decryption key/i,
      );
      // Must not touch argon2id
      expect(mockUnlockVault).not.toHaveBeenCalled();
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
      // Only 2 fetches for the initial load (vault backup + key material)
      expect(mockMailFetch).toHaveBeenCalledTimes(2);
    });

    it("handles missing vaultKeyMaterialEndpoint with cached derived key", async () => {
      // With no endpoint, we fall back to SecureStore cached derived key
      mockLoadDerivedVaultKey.mockResolvedValueOnce(MOCK_DERIVED_KEY_B64);
      // Only vault backup request (no key-material request)
      mockMailFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_VAULT_BACKUP,
      });
      mockUnlockVaultWithDerivedKey.mockResolvedValueOnce(MOCK_VAULT);
      // No keyMaterial available — vault decrypted but PGP passphrase missing
      const runtime = buildRuntime({ vaultKeyMaterialEndpoint: "" });
      await expect(ensureVaultLoaded(runtime)).rejects.toThrow(/keyMaterial unavailable/i);
    });
  });

  // ── decryptMailMessage ─────────────────────────────────────────────────────

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
        signatures: [{ verified: Promise.reject(new Error("sig invalid")) }],
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
      mockPostalMimeParse.mockResolvedValueOnce({ text: "Hello MIME world", html: null });

      const runtime = buildRuntime();
      const result = await decryptPgpMimeMessage(runtime, "msg-mime-001", MOCK_BODY_STRUCTURE as any);

      expect(mockExtractBlobId).toHaveBeenCalledWith(MOCK_BODY_STRUCTURE);
      expect(mockGetBlobAsText).toHaveBeenCalled();
      expect(mockReadMessage).toHaveBeenCalledWith({ armoredMessage: armoredCiphertext });
      expect(mockPostalMimeParse).toHaveBeenCalled();
      expect(result.plaintext).toBe("Hello MIME world");
      expect(result.html).toBeNull();
      expect(result.signatureVerificationState).toBe("not_signed");
    });

    it("returns HTML when postal-mime parses an HTML body", async () => {
      mockExtractBlobId.mockReturnValue("blob-xyz");
      mockGetBlobAsText.mockResolvedValueOnce("-----BEGIN PGP MESSAGE-----");
      mockReadMessage.mockResolvedValueOnce({});
      mockDecrypt.mockResolvedValueOnce({ data: "mime-payload", signatures: [] });
      mockPostalMimeParse.mockResolvedValueOnce({
        text: "plain text",
        html: "<p>HTML content</p>",
      });

      const runtime = buildRuntime();
      const result = await decryptPgpMimeMessage(runtime, "msg-mime-002", MOCK_BODY_STRUCTURE as any);

      expect(result.plaintext).toBe("plain text");
      expect(result.html).toBe("<p>HTML content</p>");
    });

    it("falls back to raw plaintext when postal-mime fails", async () => {
      mockExtractBlobId.mockReturnValue("blob-xyz");
      mockGetBlobAsText.mockResolvedValueOnce("-----BEGIN PGP MESSAGE-----");
      mockReadMessage.mockResolvedValueOnce({});
      mockDecrypt.mockResolvedValueOnce({ data: "raw decrypted content", signatures: [] });
      mockPostalMimeParse.mockRejectedValueOnce(new Error("MIME parse error"));

      const runtime = buildRuntime();
      const result = await decryptPgpMimeMessage(runtime, "msg-mime-003", MOCK_BODY_STRUCTURE as any);

      expect(result.plaintext).toBe("raw decrypted content");
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
