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
const mockBootstrapAccountMailbox = jest.fn();
jest.mock("./mail-api", () => ({
  getMailConfig: () => mockGetMailConfig(),
  getMailAccountStatus: () => mockGetMailAccountStatus(),
  bootstrapAccountMailbox: (...args: unknown[]) =>
    mockBootstrapAccountMailbox(...args),
}));

const mockWrapVaultSecret = jest.fn(
  async (secret: string): Promise<string | null> => `wrapped:${secret}`,
);
jest.mock("./vault-secret", () => ({
  VAULT_WRAP_ALGORITHM: "e2ee-account-key-v1",
  generateVaultSecret: () => "sealed-secret",
  wrapVaultSecret: (secret: string) => mockWrapVaultSecret(secret),
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
    mockWrapVaultSecret.mockImplementation(
      async (secret: string) => `wrapped:${secret}`,
    );
    mockGetMailConfig.mockResolvedValue({
      defaultDomain: "example.com",
      discoveryBaseUrl: "https://mail.example.com",
      signupEnabled: true,
      oauth: {},
    });
    mockGetMailAccountStatus.mockResolvedValue({
      email: "alice@example.com",
      displayName: "Alice",
      provisioned: false,
    });
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

  it("seals a random vault secret and never uses server key material", async () => {
    await bootstrapMailboxForAccount({
      userId: "user-1",
      email: "Alice@example.com",
      displayName: "Alice",
    });

    expect(mockGenerateKey).toHaveBeenCalledWith(
      expect.objectContaining({
        passphrase: "sealed-secret",
        userIDs: [{ name: "Alice", email: "alice@example.com" }],
      }),
    );
    expect(mockCreateEncryptedMailVault).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        email: "alice@example.com",
        publicKeyFingerprint: "ABCD1234",
      }),
      "sealed-secret",
    );
    expect(mockBootstrapAccountMailbox).toHaveBeenCalledWith(
      expect.objectContaining({
        algorithm: "openpgp",
        fingerprint: "ABCD1234",
        encryptedVaultB64: "vault-b64",
        wrappedSecret: "wrapped:sealed-secret",
        wrapAlgorithm: "e2ee-account-key-v1",
      }),
    );
  });

  it("refuses to provision when the secret cannot be sealed", async () => {
    mockWrapVaultSecret.mockResolvedValueOnce(null);

    await expect(
      bootstrapMailboxForAccount({
        userId: "user-1",
        email: "alice@example.com",
        displayName: "Alice",
      }),
    ).rejects.toThrow("encryption keys");

    expect(mockBootstrapAccountMailbox).not.toHaveBeenCalled();
  });
});
