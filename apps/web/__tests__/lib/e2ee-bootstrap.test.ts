import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../lib/e2ee-api-service", () => ({
  e2eeApiService: {
    getBootstrap: jest.fn(),
    upsertDevice: jest.fn(),
  },
}));

jest.mock("../../lib/e2ee-session", () => ({
  clearActiveE2eeSession: jest.fn(),
  setActiveE2eeSession: jest.fn(),
}));

jest.mock("../../lib/e2ee-storage", () => ({
  getStoredE2eeDevice: jest.fn(),
  putStoredE2eeDevice: jest.fn(),
}));

jest.mock("../../lib/e2ee-crypto", () => ({
  exportWrappingPublicKey: jest.fn(),
  generateAccountKey: jest.fn(),
  generateBlindIndexKey: jest.fn(),
  generateDeviceId: jest.fn(),
  generateWrappingKeyPair: jest.fn(),
  isWebCryptoAvailable: jest.fn(),
  unwrapAccountKey: jest.fn(),
  unwrapBlindIndexKey: jest.fn(),
  wrapSymmetricKey: jest.fn(),
}));

import { e2eeApiService } from "../../lib/e2ee-api-service";
import {
  clearActiveE2eeSession,
  setActiveE2eeSession,
} from "../../lib/e2ee-session";
import { getStoredE2eeDevice, putStoredE2eeDevice } from "../../lib/e2ee-storage";
import {
  exportWrappingPublicKey,
  generateAccountKey,
  generateBlindIndexKey,
  generateDeviceId,
  generateWrappingKeyPair,
  isWebCryptoAvailable,
  unwrapAccountKey,
  unwrapBlindIndexKey,
  wrapSymmetricKey,
} from "../../lib/e2ee-crypto";
import { ensureE2eeBootstrap, resetE2eeBootstrap } from "../../lib/e2ee-bootstrap";
import type { E2eeBootstrapResponse } from "../../lib/types/calendar";

const mockGetBootstrap = e2eeApiService.getBootstrap as jest.MockedFunction<
  typeof e2eeApiService.getBootstrap
>;
const mockUpsertDevice = e2eeApiService.upsertDevice as jest.MockedFunction<
  typeof e2eeApiService.upsertDevice
>;
const mockClearActiveE2eeSession =
  clearActiveE2eeSession as jest.MockedFunction<typeof clearActiveE2eeSession>;
const mockSetActiveE2eeSession =
  setActiveE2eeSession as jest.MockedFunction<typeof setActiveE2eeSession>;
const mockGetStoredE2eeDevice =
  getStoredE2eeDevice as jest.MockedFunction<typeof getStoredE2eeDevice>;
const mockPutStoredE2eeDevice =
  putStoredE2eeDevice as jest.MockedFunction<typeof putStoredE2eeDevice>;
const mockExportWrappingPublicKey =
  exportWrappingPublicKey as jest.MockedFunction<typeof exportWrappingPublicKey>;
const mockGenerateAccountKey =
  generateAccountKey as jest.MockedFunction<typeof generateAccountKey>;
const mockGenerateBlindIndexKey =
  generateBlindIndexKey as jest.MockedFunction<typeof generateBlindIndexKey>;
const mockGenerateDeviceId =
  generateDeviceId as jest.MockedFunction<typeof generateDeviceId>;
const mockGenerateWrappingKeyPair =
  generateWrappingKeyPair as jest.MockedFunction<typeof generateWrappingKeyPair>;
const mockIsWebCryptoAvailable =
  isWebCryptoAvailable as jest.MockedFunction<typeof isWebCryptoAvailable>;
const mockUnwrapAccountKey =
  unwrapAccountKey as jest.MockedFunction<typeof unwrapAccountKey>;
const mockUnwrapBlindIndexKey =
  unwrapBlindIndexKey as jest.MockedFunction<typeof unwrapBlindIndexKey>;
const mockWrapSymmetricKey =
  wrapSymmetricKey as jest.MockedFunction<typeof wrapSymmetricKey>;

function createLocalDeviceRecord(userId: string) {
  return {
    userId,
    deviceId: `device-${userId}`,
    publicKey: `public-${userId}`,
    privateKey: {} as CryptoKey,
    wrappedAccountKey: `wrapped-account-${userId}`,
    wrappedSearchKey: `wrapped-search-${userId}`,
    wrapAlgorithm: "RSA-OAEP-256",
    keyVersion: 1,
    createdAt: "2026-04-22T10:00:00.000Z",
    updatedAt: "2026-04-22T10:00:00.000Z",
  };
}

function createRemoteBootstrap(userId: string): E2eeBootstrapResponse {
  return {
    enabled: true,
    rolloutStage: "shadow_write",
    algorithms: {
      content: "AES-GCM-256",
      blindIndex: "HMAC-SHA-256",
      wrapping: "RSA-OAEP-256",
    },
    devices: [
      {
        id: `remote-${userId}`,
        userId,
        deviceId: `device-${userId}`,
        deviceLabel: `${userId} browser`,
        publicKey: `public-${userId}`,
        publicKeyAlgorithm: "RSA-OAEP-256",
        wrappedAccountKey: `wrapped-account-${userId}`,
        wrappedSearchKey: `wrapped-search-${userId}`,
        wrapAlgorithm: "RSA-OAEP-256",
        keyVersion: 1,
        lastSeenAt: new Date("2026-04-22T10:00:00.000Z"),
        createdAt: new Date("2026-04-22T10:00:00.000Z"),
        updatedAt: new Date("2026-04-22T10:00:00.000Z"),
      },
    ],
    calendars: [],
  };
}

describe("e2ee bootstrap guards", () => {
  beforeEach(() => {
    resetE2eeBootstrap();
    jest.clearAllMocks();
    mockIsWebCryptoAvailable.mockReturnValue(true);
    mockGetStoredE2eeDevice.mockImplementation(async (userId: string) =>
      createLocalDeviceRecord(userId),
    );
    mockUnwrapAccountKey.mockResolvedValue({} as CryptoKey);
    mockUnwrapBlindIndexKey.mockResolvedValue({} as CryptoKey);
    mockGenerateWrappingKeyPair.mockResolvedValue({
      publicKey: {} as CryptoKey,
      privateKey: {} as CryptoKey,
    } as CryptoKeyPair);
    mockGenerateAccountKey.mockResolvedValue({} as CryptoKey);
    mockGenerateBlindIndexKey.mockResolvedValue({} as CryptoKey);
    mockExportWrappingPublicKey.mockResolvedValue("public-key");
    mockGenerateDeviceId.mockReturnValue("generated-device");
    mockWrapSymmetricKey.mockResolvedValue("wrapped-key");
    mockUpsertDevice.mockResolvedValue({
      id: "remote-device",
      userId: "user-1",
      deviceId: "generated-device",
      deviceLabel: null,
      publicKey: "public-key",
      publicKeyAlgorithm: "RSA-OAEP-256",
      wrappedAccountKey: "wrapped-key",
      wrappedSearchKey: "wrapped-key",
      wrapAlgorithm: "RSA-OAEP-256",
      keyVersion: 1,
      lastSeenAt: new Date("2026-04-22T10:00:00.000Z"),
      createdAt: new Date("2026-04-22T10:00:00.000Z"),
      updatedAt: new Date("2026-04-22T10:00:00.000Z"),
    });
    mockPutStoredE2eeDevice.mockResolvedValue(undefined);
  });

  it("discards a stale bootstrap result after reset", async () => {
    let resolveBootstrap!: (value: ReturnType<typeof createRemoteBootstrap>) => void;
    mockGetBootstrap.mockReturnValue(
      new Promise((resolve) => {
        resolveBootstrap = resolve;
      }),
    );

    const pendingBootstrap = ensureE2eeBootstrap("user-1");
    resetE2eeBootstrap();
    resolveBootstrap(createRemoteBootstrap("user-1"));

    await expect(pendingBootstrap).resolves.toBe(false);
    expect(mockSetActiveE2eeSession).not.toHaveBeenCalled();
    expect(mockClearActiveE2eeSession).toHaveBeenCalled();
  });

  it("does not restore the previous user's keys after an account switch", async () => {
    let resolveFirstBootstrap!: (
      value: ReturnType<typeof createRemoteBootstrap>,
    ) => void;
    mockGetBootstrap
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirstBootstrap = resolve;
        }),
      )
      .mockResolvedValueOnce(createRemoteBootstrap("user-2"));

    const firstBootstrap = ensureE2eeBootstrap("user-1");
    const secondBootstrap = ensureE2eeBootstrap("user-2");

    await expect(secondBootstrap).resolves.toBe(true);
    expect(mockSetActiveE2eeSession).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-2", deviceId: "device-user-2" }),
    );

    resolveFirstBootstrap(createRemoteBootstrap("user-1"));

    await expect(firstBootstrap).resolves.toBe(false);
    expect(mockSetActiveE2eeSession).toHaveBeenCalledTimes(1);
  });
});
