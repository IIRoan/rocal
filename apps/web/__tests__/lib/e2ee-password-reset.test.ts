import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../lib/e2ee-api-service", () => ({
  e2eeApiService: {
    getResetSnapshot: jest.fn(),
    upsertPasswordEnvelope: jest.fn(),
  },
}));

jest.mock("../../lib/e2ee-crypto", () => ({
  createBlindIndexTokens: jest.fn(),
  createPasswordEnvelope: jest.fn(),
  decryptJsonPayload: jest.fn(),
  encryptJsonPayload: jest.fn(),
}));

jest.mock("../../lib/e2ee-session", () => ({
  getActiveE2eeSession: jest.fn(),
}));

jest.mock("../../lib/e2ee-password-cache", () => ({
  clearPendingAuthPassword: jest.fn(),
}));

jest.mock("../../lib/http-client", () => ({
  httpClient: {
    put: jest.fn(),
  },
}));

import { e2eeApiService } from "../../lib/e2ee-api-service";
import {
  createBlindIndexTokens,
  createPasswordEnvelope,
  decryptJsonPayload,
  encryptJsonPayload,
} from "../../lib/e2ee-crypto";
import { clearPendingAuthPassword } from "../../lib/e2ee-password-cache";
import { getActiveE2eeSession } from "../../lib/e2ee-session";
import { httpClient } from "../../lib/http-client";
import { resetEncryptionPasswordForActiveSession } from "../../lib/e2ee-password-reset";

const mockGetResetSnapshot =
  e2eeApiService.getResetSnapshot as jest.MockedFunction<
    typeof e2eeApiService.getResetSnapshot
  >;
const mockUpsertPasswordEnvelope =
  e2eeApiService.upsertPasswordEnvelope as jest.MockedFunction<
    typeof e2eeApiService.upsertPasswordEnvelope
  >;
const mockCreateBlindIndexTokens =
  createBlindIndexTokens as jest.MockedFunction<typeof createBlindIndexTokens>;
const mockCreatePasswordEnvelope =
  createPasswordEnvelope as jest.MockedFunction<typeof createPasswordEnvelope>;
const mockDecryptJsonPayload =
  decryptJsonPayload as jest.MockedFunction<typeof decryptJsonPayload>;
const mockEncryptJsonPayload =
  encryptJsonPayload as jest.MockedFunction<typeof encryptJsonPayload>;
const mockGetActiveE2eeSession =
  getActiveE2eeSession as jest.MockedFunction<typeof getActiveE2eeSession>;
const mockClearPendingAuthPassword =
  clearPendingAuthPassword as jest.MockedFunction<typeof clearPendingAuthPassword>;
const mockHttpPut = httpClient.put as jest.MockedFunction<typeof httpClient.put>;

describe("resetEncryptionPasswordForActiveSession", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetActiveE2eeSession.mockReturnValue({
      userId: "user-1",
      deviceId: "device-1",
      accountKey: {} as CryptoKey,
      blindIndexKey: {} as CryptoKey,
      activatedAt: new Date("2026-04-22T10:00:00.000Z"),
    });
    mockGetResetSnapshot.mockResolvedValue({
      calendars: [
        {
          id: "calendar-1",
          name: "Work",
          encryptedName: "old-calendar-ciphertext",
          blindIndexTokens: ["old-calendar-index"],
          encryptionState: "shadow_write",
          encryptionKeyVersion: 2,
          color: "blue",
          kind: "owned",
          isDefault: true,
          isVisible: true,
          createdAt: new Date("2026-04-20T11:00:00.000Z"),
          updatedAt: new Date("2026-04-21T12:00:00.000Z"),
        },
      ],
      categories: [
        {
          id: "category-1",
          name: "Focus",
          encryptedName: "old-category-ciphertext",
          blindIndexTokens: ["old-category-index"],
          encryptionState: "shadow_write",
          encryptionKeyVersion: 2,
          color: "violet",
          isActive: true,
          createdAt: new Date("2026-04-20T11:00:00.000Z"),
          updatedAt: new Date("2026-04-21T12:00:00.000Z"),
        },
      ],
      events: [
        {
          id: "event-1",
          title: "",
          description: null,
          encryptedContent: JSON.stringify({
            version: 1,
            algorithm: "AES-GCM",
            iv: "iv",
            ciphertext: "ciphertext",
          }),
          blindIndexTokens: ["old-event-index"],
          encryptionState: "encrypted",
          encryptionKeyVersion: 2,
          start: new Date("2026-05-01T10:00:00.000Z"),
          end: new Date("2026-05-01T11:00:00.000Z"),
          timezone: "UTC",
          allDay: false,
          location: null,
          color: "blue",
          calendarId: "calendar-1",
          categoryId: "category-1",
          reminder: null,
          recurrence: null,
          parentEventId: null,
          createdAt: new Date("2026-04-20T11:00:00.000Z"),
          updatedAt: new Date("2026-04-21T12:00:00.000Z"),
        },
      ],
    });
    mockCreateBlindIndexTokens.mockResolvedValue(["new-index"]);
    mockEncryptJsonPayload.mockResolvedValue({
      version: 1,
      algorithm: "AES-GCM",
      iv: "new-iv",
      ciphertext: "new-ciphertext",
    });
    mockDecryptJsonPayload.mockResolvedValue({
      title: "Planning",
      description: "Discuss roadmap",
      location: "Room 7",
    });
    mockCreatePasswordEnvelope.mockResolvedValue({
      kdfAlgorithm: "PBKDF2-SHA-256",
      kdfSalt: "salt-1",
      kdfIterations: 310000,
      wrappedAccountKey: "wrapped-account",
      wrappedSearchKey: "wrapped-search",
      wrapAlgorithm: "AES-GCM-256",
      keyVersion: 2,
    });
    mockUpsertPasswordEnvelope.mockResolvedValue({
      id: "password-envelope-1",
      userId: "user-1",
      kdfAlgorithm: "PBKDF2-SHA-256",
      kdfSalt: "salt-1",
      kdfIterations: 310000,
      wrappedAccountKey: "wrapped-account",
      wrappedSearchKey: "wrapped-search",
      wrapAlgorithm: "AES-GCM-256",
      keyVersion: 2,
      createdAt: new Date("2026-04-22T10:00:00.000Z"),
      updatedAt: new Date("2026-04-22T10:00:00.000Z"),
    });
    mockHttpPut.mockResolvedValue({} as never);
  });

  it("returns false when there is no active session for the user", async () => {
    mockGetActiveE2eeSession.mockReturnValue(null);

    await expect(
      resetEncryptionPasswordForActiveSession("user-1", "correct horse battery staple"),
    ).resolves.toBe(false);

    expect(mockGetResetSnapshot).not.toHaveBeenCalled();
  });

  it("rewrites encrypted shadows before storing a new password envelope", async () => {
    await expect(
      resetEncryptionPasswordForActiveSession("user-1", "correct horse battery staple"),
    ).resolves.toBe(true);

    expect(mockGetResetSnapshot).toHaveBeenCalled();
    expect(mockDecryptJsonPayload).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ algorithm: "AES-GCM" }),
      "event-content:v2",
    );
    expect(mockHttpPut).toHaveBeenNthCalledWith(
      1,
      "/api/calendars/calendar-1",
      expect.objectContaining({
        name: "Work",
        encryptionState: "shadow_write",
        encryptionKeyVersion: 2,
      }),
    );
    expect(mockHttpPut).toHaveBeenNthCalledWith(
      2,
      "/api/categories/category-1",
      expect.objectContaining({
        name: "Focus",
        encryptionState: "shadow_write",
        encryptionKeyVersion: 2,
      }),
    );
    expect(mockHttpPut).toHaveBeenNthCalledWith(
      3,
      "/api/events/event-1",
      expect.objectContaining({
        title: "Planning",
        description: "Discuss roadmap",
        location: "Room 7",
        encryptionKeyVersion: 2,
      }),
    );
    expect(mockCreatePasswordEnvelope).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "correct horse battery staple",
      2,
    );
    expect(mockUpsertPasswordEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({ kdfSalt: "salt-1", keyVersion: 2 }),
    );
    expect(mockClearPendingAuthPassword).toHaveBeenCalled();
  });
});