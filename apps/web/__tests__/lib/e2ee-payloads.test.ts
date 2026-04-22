import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../lib/e2ee-session", () => ({
  getActiveE2eeSession: jest.fn(),
}));

jest.mock("../../lib/e2ee-bootstrap", () => ({
  waitForPendingE2eeBootstrap: jest.fn(),
}));

jest.mock("../../lib/e2ee-crypto", () => ({
  encryptJsonPayload: jest.fn(),
  createBlindIndexTokens: jest.fn(),
}));

import { waitForPendingE2eeBootstrap } from "../../lib/e2ee-bootstrap";
import { getActiveE2eeSession } from "../../lib/e2ee-session";
import {
  createBlindIndexTokens,
  encryptJsonPayload,
} from "../../lib/e2ee-crypto";
import {
  attachCalendarEncryptionShadow,
  attachCategoryEncryptionShadow,
  attachEventEncryptionShadow,
} from "../../lib/e2ee-payloads";

const mockGetActiveE2eeSession =
  getActiveE2eeSession as jest.MockedFunction<typeof getActiveE2eeSession>;
const mockWaitForPendingE2eeBootstrap =
  waitForPendingE2eeBootstrap as jest.MockedFunction<
    typeof waitForPendingE2eeBootstrap
  >;
const mockEncryptJsonPayload =
  encryptJsonPayload as jest.MockedFunction<typeof encryptJsonPayload>;
const mockCreateBlindIndexTokens =
  createBlindIndexTokens as jest.MockedFunction<typeof createBlindIndexTokens>;

const activeSession = {
  userId: "user-1",
  deviceId: "device-1",
  accountKey: {} as CryptoKey,
  blindIndexKey: {} as CryptoKey,
  activatedAt: new Date("2026-04-22T10:00:00.000Z"),
};

describe("e2ee payload helpers", () => {
  beforeEach(() => {
    mockWaitForPendingE2eeBootstrap.mockReturnValue(null);
    mockGetActiveE2eeSession.mockReturnValue(activeSession);
    mockEncryptJsonPayload.mockResolvedValue({
      version: 1,
      algorithm: "AES-GCM",
      iv: "iv",
      ciphertext: "ciphertext",
    });
    mockCreateBlindIndexTokens.mockResolvedValue(["idx-1", "idx-2"]);
  });

  it("returns the original event request when no active session exists", async () => {
    mockGetActiveE2eeSession.mockReturnValue(null);
    const request = {
      title: "Secret event",
      start: "2026-05-01T10:00:00.000Z",
      end: "2026-05-01T11:00:00.000Z",
      calendarId: "cal-1",
    };

    await expect(attachEventEncryptionShadow(request)).resolves.toBe(request);
    expect(mockEncryptJsonPayload).not.toHaveBeenCalled();
    expect(mockCreateBlindIndexTokens).not.toHaveBeenCalled();
  });

  it("skips event encryption when the title is blank", async () => {
    const request = {
      title: "   ",
      start: "2026-05-01T10:00:00.000Z",
      end: "2026-05-01T11:00:00.000Z",
      calendarId: "cal-1",
    };

    await expect(attachEventEncryptionShadow(request)).resolves.toBe(request);
    expect(mockEncryptJsonPayload).not.toHaveBeenCalled();
  });

  it("waits for bootstrap before encrypting event payloads", async () => {
    mockGetActiveE2eeSession
      .mockReturnValueOnce(null)
      .mockReturnValue(activeSession);
    mockWaitForPendingE2eeBootstrap.mockReturnValue(
      Promise.resolve(true) as Promise<boolean>,
    );

    const request = {
      title: "Secret event",
      start: "2026-05-01T10:00:00.000Z",
      end: "2026-05-01T11:00:00.000Z",
      calendarId: "cal-1",
    };

    const result = (await attachEventEncryptionShadow(request)) as typeof request & {
      encryptedContent?: string;
    };

    expect(mockWaitForPendingE2eeBootstrap).toHaveBeenCalled();
    expect(mockEncryptJsonPayload).toHaveBeenCalled();
    expect(result.encryptedContent).toBeDefined();
  });

  it("attaches encrypted event shadow fields when a session is active", async () => {
    const request = {
      title: "  Secret event  ",
      description: "  hidden agenda  ",
      location: "  Room 7  ",
      start: "2026-05-01T10:00:00.000Z",
      end: "2026-05-01T11:00:00.000Z",
      calendarId: "cal-1",
    };

    const result = await attachEventEncryptionShadow(request);

    expect(mockEncryptJsonPayload).toHaveBeenCalledWith(
      activeSession.accountKey,
      {
        title: "Secret event",
        description: "hidden agenda",
        location: "Room 7",
      },
      "event-content:v1",
    );
    expect(mockCreateBlindIndexTokens).toHaveBeenCalledWith(
      activeSession.blindIndexKey,
      "Secret event hidden agenda Room 7",
    );
    expect(result).toEqual({
      ...request,
      encryptedContent: JSON.stringify({
        version: 1,
        algorithm: "AES-GCM",
        iv: "iv",
        ciphertext: "ciphertext",
      }),
      blindIndexTokens: ["idx-1", "idx-2"],
      encryptionState: "encrypted",
      encryptionKeyVersion: 1,
    });
  });

  it("attaches encrypted calendar name shadow fields", async () => {
    const request = { name: "  Work  ", color: "blue" };

    const result = await attachCalendarEncryptionShadow(request);

    expect(mockEncryptJsonPayload).toHaveBeenCalledWith(
      activeSession.accountKey,
      { name: "Work" },
      "calendar-name:v1",
    );
    expect(mockCreateBlindIndexTokens).toHaveBeenCalledWith(
      activeSession.blindIndexKey,
      "Work",
    );
    expect(result).toEqual(
      expect.objectContaining({
        encryptedName: JSON.stringify({
          version: 1,
          algorithm: "AES-GCM",
          iv: "iv",
          ciphertext: "ciphertext",
        }),
        blindIndexTokens: ["idx-1", "idx-2"],
        encryptionState: "shadow_write",
        encryptionKeyVersion: 1,
      }),
    );
  });

  it("attaches encrypted category name shadow fields", async () => {
    const request = { name: "  Personal  ", color: "emerald" };

    const result = await attachCategoryEncryptionShadow(request);

    expect(mockEncryptJsonPayload).toHaveBeenCalledWith(
      activeSession.accountKey,
      { name: "Personal" },
      "category-name:v1",
    );
    expect(mockCreateBlindIndexTokens).toHaveBeenCalledWith(
      activeSession.blindIndexKey,
      "Personal",
    );
    expect(result).toEqual(
      expect.objectContaining({
        encryptedName: JSON.stringify({
          version: 1,
          algorithm: "AES-GCM",
          iv: "iv",
          ciphertext: "ciphertext",
        }),
        blindIndexTokens: ["idx-1", "idx-2"],
        encryptionState: "shadow_write",
        encryptionKeyVersion: 1,
      }),
    );
  });
});