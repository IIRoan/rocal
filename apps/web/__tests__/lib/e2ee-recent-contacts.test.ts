import type { RecentContactsPayload } from "@workspace/calendar-core";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../lib/e2ee-session", () => ({
  getActiveE2eeSession: jest.fn(),
}));

jest.mock("../../lib/e2ee-bootstrap", () => ({
  waitForPendingE2eeBootstrap: jest.fn(),
}));

jest.mock("../../lib/e2ee-crypto", () => ({
  decryptJsonPayload: jest.fn(),
  encryptJsonPayload: jest.fn(),
}));

jest.mock("../../lib/calendar-api-service", () => ({
  calendarApiService: {
    getRecentContacts: jest.fn(),
    putRecentContacts: jest.fn(),
  },
}));

import { waitForPendingE2eeBootstrap } from "../../lib/e2ee-bootstrap";
import {
  decryptJsonPayload,
  encryptJsonPayload,
} from "../../lib/e2ee-crypto";
import { calendarApiService } from "../../lib/calendar-api-service";
import { getActiveE2eeSession } from "../../lib/e2ee-session";
import {
  loadRecentContacts,
  recordRecentContacts,
  saveRecentContacts,
} from "../../lib/e2ee-recent-contacts";

const mockGetActiveE2eeSession = getActiveE2eeSession as jest.MockedFunction<
  typeof getActiveE2eeSession
>;
const mockWaitForPendingE2eeBootstrap =
  waitForPendingE2eeBootstrap as jest.MockedFunction<
    typeof waitForPendingE2eeBootstrap
  >;
const mockDecryptJsonPayload = decryptJsonPayload as jest.MockedFunction<
  typeof decryptJsonPayload
>;
const mockEncryptJsonPayload = encryptJsonPayload as jest.MockedFunction<
  typeof encryptJsonPayload
>;
const mockGetRecentContacts = calendarApiService.getRecentContacts as jest.MockedFunction<
  typeof calendarApiService.getRecentContacts
>;
const mockPutRecentContacts = calendarApiService.putRecentContacts as jest.MockedFunction<
  typeof calendarApiService.putRecentContacts
>;

const activeSession = {
  userId: "user-1",
  deviceId: "device-1",
  accountKey: {} as CryptoKey,
  blindIndexKey: {} as CryptoKey,
  activatedAt: new Date("2026-06-19T10:00:00.000Z"),
};

const samplePayload: RecentContactsPayload = {
  version: 1,
  contacts: [
    {
      email: "alice@example.com",
      displayName: "Alice",
      lastUsedAt: "2026-06-19T10:00:00.000Z",
      useCount: 1,
      contexts: ["mail"] as const,
    },
  ],
};

describe("e2ee-recent-contacts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWaitForPendingE2eeBootstrap.mockReturnValue(null);
    mockGetActiveE2eeSession.mockReturnValue(activeSession);
    mockEncryptJsonPayload.mockResolvedValue({
      version: 1,
      algorithm: "AES-GCM",
      iv: "iv",
      ciphertext: "ciphertext",
    });
    mockDecryptJsonPayload.mockResolvedValue(samplePayload);
    mockGetRecentContacts.mockResolvedValue({
      encryptedContent: JSON.stringify({ version: 1 }),
      encryptionKeyVersion: 1,
      updatedAt: "2026-06-19T10:00:00.000Z",
    });
    mockPutRecentContacts.mockResolvedValue({
      encryptedContent: JSON.stringify({ version: 1 }),
      encryptionKeyVersion: 1,
      updatedAt: "2026-06-19T11:00:00.000Z",
    });
  });

  it("returns null when no E2EE session is active", async () => {
    mockGetActiveE2eeSession.mockReturnValue(null);

    await expect(loadRecentContacts()).resolves.toBeNull();
    await expect(
      saveRecentContacts(samplePayload),
    ).resolves.toBe(false);
  });

  it("loads and decrypts recent contacts from the backend", async () => {
    const payload = await loadRecentContacts();

    expect(mockGetRecentContacts).toHaveBeenCalled();
    expect(mockDecryptJsonPayload).toHaveBeenCalledWith(
      activeSession.accountKey,
      { version: 1 },
      "recent-contacts:v1",
    );
    expect(payload).toEqual(samplePayload);
  });

  it("returns an empty payload when the backend has no record", async () => {
    mockGetRecentContacts.mockResolvedValue(null);

    const payload = await loadRecentContacts();

    expect(payload).toEqual({ version: 1, contacts: [] });
    expect(mockDecryptJsonPayload).not.toHaveBeenCalled();
  });

  it("encrypts and upserts recent contacts on save", async () => {
    const saved = await saveRecentContacts(samplePayload);

    expect(saved).toBe(true);
    expect(mockEncryptJsonPayload).toHaveBeenCalledWith(
      activeSession.accountKey,
      samplePayload,
      "recent-contacts:v1",
    );
    expect(mockPutRecentContacts).toHaveBeenCalledWith({
      encryptedContent: expect.any(String),
      encryptionKeyVersion: 1,
    });
  });

  it("records usage by merging into the encrypted payload", async () => {
    const result = await recordRecentContacts(
      [{ email: "bob@example.com" }],
      "mail",
    );

    expect(result?.contacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: "alice@example.com" }),
        expect.objectContaining({ email: "bob@example.com" }),
      ]),
    );
    expect(mockPutRecentContacts).toHaveBeenCalled();
  });

  it("skips recordRecentContacts when entries are empty", async () => {
    await expect(recordRecentContacts([], "mail")).resolves.toBeNull();
    expect(mockPutRecentContacts).not.toHaveBeenCalled();
  });
});
