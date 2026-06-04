import { bootstrapMailboxForAccount } from "./account-bootstrap";

jest.mock("@workspace/logger", () => ({
  createLogger: () => ({
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  }),
}));

const mockGetMailConfig = jest.fn();
const mockGetMailAccountStatus = jest.fn();
const mockGetVaultKeyMaterial = jest.fn();
const mockBootstrapAccountMailbox = jest.fn();
jest.mock("./mail-api", () => ({
  getMailConfig: () => mockGetMailConfig(),
  getMailAccountStatus: () => mockGetMailAccountStatus(),
  getVaultKeyMaterial: (...args: unknown[]) => mockGetVaultKeyMaterial(...args),
  bootstrapAccountMailbox: (...args: unknown[]) =>
    mockBootstrapAccountMailbox(...args),
}));

const mockLoadMailVaultPassword = jest.fn();
jest.mock("./mail-password-cache", () => ({
  loadMailVaultPassword: () => mockLoadMailVaultPassword(),
}));

const mockCreateEncryptedMailVault = jest.fn();
jest.mock("./native-vault-crypto", () => ({
  createEncryptedMailVault: (...args: unknown[]) =>
    mockCreateEncryptedMailVault(...args),
}));

const mockGenerateKey = jest.fn();
const mockReadKey = jest.fn();
jest.mock("openpgp", () => ({
  generateKey: (...args: unknown[]) => mockGenerateKey(...args),
  readKey: (...args: unknown[]) => mockReadKey(...args),
}));

describe("bootstrapMailboxForAccount", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockGetMailConfig.mockResolvedValue({
      defaultDomain: "example.com",
      discoveryBaseUrl: "https://mail.example.com",
      signupEnabled: true,
      oauth: {},
      vaultKeyMaterialEndpoint: "https://api.example.com/api/mail/vault-key-material",
    });
    mockGetMailAccountStatus.mockResolvedValue({
      email: "alice@example.com",
      displayName: "Alice",
      provisioned: false,
    });
    mockLoadMailVaultPassword.mockResolvedValue("stored-password");
    mockGenerateKey.mockResolvedValue({
      privateKey: "PRIVATE_KEY",
      publicKey: "PUBLIC_KEY",
    });
    mockReadKey.mockResolvedValue({
      getFingerprint: () => "abcd1234",
    });
    mockCreateEncryptedMailVault.mockResolvedValue({
      encryptedVaultB64: "vault-b64",
      kdf: "argon2id",
      kdfParams: {
        saltB64: "salt",
        memoryKiB: 8192,
        iterations: 1,
        parallelism: 1,
      },
    });
    mockBootstrapAccountMailbox.mockResolvedValue({
      email: "alice@example.com",
      displayName: "Alice",
      stalwartAccountId: "acct-1",
      stalwartPublicKeyId: "pk-1",
      fingerprint: "ABCD1234",
      encryptionAtRestEnabled: true,
    });
  });

  it("prefers server key material and reduced KDF settings", async () => {
    mockGetVaultKeyMaterial.mockResolvedValue({
      keyMaterial: "server-key-material",
      version: "v1",
    });

    await bootstrapMailboxForAccount({
      userId: "user-1",
      email: "Alice@example.com",
      displayName: "Alice",
    });

    expect(mockGenerateKey).toHaveBeenCalledWith(
      expect.objectContaining({
        passphrase: "server-key-material",
        userIDs: [{ name: "Alice", email: "alice@example.com" }],
      }),
    );
    expect(mockCreateEncryptedMailVault).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        email: "alice@example.com",
        publicKeyFingerprint: "ABCD1234",
      }),
      "server-key-material",
      {
        memoryKiB: 8192,
        iterations: 1,
        parallelism: 1,
      },
    );
    expect(mockBootstrapAccountMailbox).toHaveBeenCalledWith(
      expect.objectContaining({
        algorithm: "openpgp",
        fingerprint: "ABCD1234",
        encryptedVaultB64: "vault-b64",
      }),
    );
  });

  it("falls back to the stored sign-in password when key material is unavailable", async () => {
    mockGetVaultKeyMaterial.mockRejectedValue(new Error("offline"));

    await bootstrapMailboxForAccount({
      userId: "user-1",
      email: "alice@example.com",
      displayName: "Alice",
    });

    expect(mockGenerateKey).toHaveBeenCalledWith(
      expect.objectContaining({
        passphrase: "stored-password",
      }),
    );
    expect(mockCreateEncryptedMailVault).toHaveBeenCalledWith(
      expect.any(Object),
      "stored-password",
      undefined,
    );
  });
});
