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

  it("uses a cached derived key and asks the API to skip argon2", async () => {
    mockGetStored.mockResolvedValue("cached-derived-key");
    mockGetVaultKeyMaterial.mockResolvedValue({
      keyMaterial: "km",
      derivedKeyB64: null,
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
      { includeDerived: false },
    );
    expect(mockPutStored).not.toHaveBeenCalled();
  });

  it("fetches and stores a derived key when cache is empty", async () => {
    mockGetStored.mockResolvedValue(null);
    mockGetVaultKeyMaterial.mockResolvedValue({
      keyMaterial: "km",
      derivedKeyB64: "fresh-derived-key",
      version: "v1",
    });

    await expect(
      fetchVaultKeyMaterialForOpen({
        endpoint: "https://api.test/api/mail/vault-key-material",
        userId: "user-1",
      }),
    ).resolves.toEqual({
      keyMaterial: "km",
      derivedKeyB64: "fresh-derived-key",
      version: "v1",
      usedCachedDerivedKey: false,
    });

    expect(mockGetVaultKeyMaterial).toHaveBeenCalledWith(
      "https://api.test/api/mail/vault-key-material",
      { includeDerived: true },
    );
    expect(mockPutStored).toHaveBeenCalledWith("user-1", "fresh-derived-key");
  });

  it("clears cache and refreshes after a derived-key miss", async () => {
    mockGetVaultKeyMaterial.mockResolvedValue({
      keyMaterial: "km",
      derivedKeyB64: "new-derived-key",
      version: "v1",
    });

    await expect(
      refreshVaultKeyMaterialAfterCacheMiss({
        endpoint: "https://api.test/api/mail/vault-key-material",
        userId: "user-1",
      }),
    ).resolves.toEqual({
      keyMaterial: "km",
      derivedKeyB64: "new-derived-key",
      version: "v1",
      usedCachedDerivedKey: false,
    });

    expect(mockDeleteStored).toHaveBeenCalledWith("user-1");
    expect(mockGetVaultKeyMaterial).toHaveBeenCalledWith(
      "https://api.test/api/mail/vault-key-material",
      { includeDerived: true },
    );
  });
});
