import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../lib/mail/api-service", () => ({
  mailDemoApiService: {
    getVaultKeyMaterial: jest.fn(),
  },
}));

jest.mock("../../lib/mail/derived-vault-key-storage", () => ({
  getStoredDerivedVaultKey: jest.fn(),
  putStoredDerivedVaultKey: jest.fn(),
  deleteStoredDerivedVaultKey: jest.fn(),
}));

import { mailDemoApiService } from "../../lib/mail/api-service";
import {
  deleteStoredDerivedVaultKey,
  getStoredDerivedVaultKey,
  putStoredDerivedVaultKey,
} from "../../lib/mail/derived-vault-key-storage";
import {
  fetchVaultKeyMaterialForOpen,
  refreshVaultKeyMaterialAfterCacheMiss,
} from "../../lib/mail/mail-open-prefetch";

const mockGetVaultKeyMaterial = jest.mocked(
  mailDemoApiService.getVaultKeyMaterial,
);
const mockGetStored = jest.mocked(getStoredDerivedVaultKey);
const mockPutStored = jest.mocked(putStoredDerivedVaultKey);
const mockDeleteStored = jest.mocked(deleteStoredDerivedVaultKey);

describe("fetchVaultKeyMaterialForOpen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reuses a locally cached derived key", async () => {
    mockGetStored.mockResolvedValue("cached-derived-key");
    mockGetVaultKeyMaterial.mockResolvedValue({
      keyMaterial: "km",
      version: "v1",
    });

    await expect(
      fetchVaultKeyMaterialForOpen({
        endpoint: "https://api.test/api/mail/vault-key-material",
        userId: "user-1",
      }),
    ).resolves.toEqual({
      keyMaterial: "km",
      derivedKeyB64: "cached-derived-key",
      version: "v1",
      usedCachedDerivedKey: true,
    });

    expect(mockGetVaultKeyMaterial).toHaveBeenCalledWith(
      "https://api.test/api/mail/vault-key-material",
    );
    expect(mockPutStored).not.toHaveBeenCalled();
  });

  it("never takes a derived key from the server", async () => {
    mockGetStored.mockResolvedValue(null);
    mockGetVaultKeyMaterial.mockResolvedValue({
      keyMaterial: "km",
      // A server that still returned one must not be trusted with it.
      derivedKeyB64: "server-derived-key",
      version: "v1",
    } as never);

    await expect(
      fetchVaultKeyMaterialForOpen({
        endpoint: "https://api.test/api/mail/vault-key-material",
        userId: "user-1",
      }),
    ).resolves.toEqual({
      keyMaterial: "km",
      derivedKeyB64: null,
      version: "v1",
      usedCachedDerivedKey: false,
    });

    expect(mockPutStored).not.toHaveBeenCalled();
  });

  it("clears the cached key after a derived-key miss", async () => {
    mockGetVaultKeyMaterial.mockResolvedValue({
      keyMaterial: "km",
      version: "v1",
    });

    await expect(
      refreshVaultKeyMaterialAfterCacheMiss({
        endpoint: "https://api.test/api/mail/vault-key-material",
        userId: "user-1",
      }),
    ).resolves.toEqual({
      keyMaterial: "km",
      derivedKeyB64: null,
      version: "v1",
      usedCachedDerivedKey: false,
    });

    expect(mockDeleteStored).toHaveBeenCalledWith("user-1");
  });
});
