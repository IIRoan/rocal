import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../lib/e2ee-payloads", () => ({
  getEncryptionSession: jest.fn(),
  attachCalendarEncryptionShadow: jest.fn(),
  attachCategoryEncryptionShadow: jest.fn(),
  attachEventEncryptionShadow: jest.fn(),
}));

jest.mock("../../lib/e2ee-crypto", () => ({
  createBlindIndexTokens: jest.fn(),
  decryptJsonPayload: jest.fn(),
  encryptJsonPayload: jest.fn(),
  parseEncryptedJsonPayload: jest.fn(),
}));

jest.mock("../../lib/e2ee-notification-title", () => ({
  encryptReminderLead: jest.fn(),
  encryptReminderTitle: jest.fn(),
}));

jest.mock("../../lib/e2ee-storage", () => ({
  getStoredE2eeDevice: jest.fn(),
  markStoredEventContentBound: jest.fn(),
}));

import type { CalendarEvent } from "@workspace/calendar-core";
import { decryptJsonPayload } from "../../lib/e2ee-crypto";
import { getEncryptionSession } from "../../lib/e2ee-payloads";
import {
  getStoredE2eeDevice,
  markStoredEventContentBound,
} from "../../lib/e2ee-storage";
import { WebE2eeProvider } from "../../lib/web-e2ee-provider";

const mockSession = getEncryptionSession as jest.MockedFunction<typeof getEncryptionSession>;
const mockDecrypt = decryptJsonPayload as jest.MockedFunction<typeof decryptJsonPayload>;
const mockStoredDevice = getStoredE2eeDevice as jest.MockedFunction<typeof getStoredE2eeDevice>;

const envelope = JSON.stringify({ version: 1, algorithm: "AES-GCM", iv: "iv", ciphertext: "c" });

function event(id: string, encryptionKeyVersion: number): CalendarEvent {
  return {
    id,
    title: "",
    encryptedContent: envelope,
    encryptionState: "encrypted",
    encryptionKeyVersion,
    start: new Date("2099-03-02T09:00:00.000Z"),
    end: new Date("2099-03-02T10:00:00.000Z"),
    calendarId: "cal-1",
    userId: "user-1",
    createdAt: new Date("2099-01-01T00:00:00.000Z"),
    updatedAt: new Date("2099-01-01T00:00:00.000Z"),
  };
}

describe("WebE2eeProvider event content", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession.mockResolvedValue({
      userId: "user-1",
      deviceId: "device-1",
      accountKey: {} as CryptoKey,
      blindIndexKey: {} as CryptoKey,
      activatedAt: new Date(),
    });
    mockDecrypt.mockResolvedValue({ title: "Gym" } as never);
    mockStoredDevice.mockResolvedValue(null);
  });

  it("opens bound content under its series row id", async () => {
    const provider = new WebE2eeProvider();

    await expect(
      provider.hydrateEncryptedEvent(event("e1_2099-03-09T09:00:00.000Z", 2)),
    ).resolves.toMatchObject({ title: "Gym" });
    expect(mockDecrypt.mock.calls[0]?.[2]).toBe("event-content:v2:e1");
  });

  it("opens unbound content until this device is marked bound, then refuses it", async () => {
    const provider = new WebE2eeProvider();
    await expect(provider.hydrateEncryptedEvent(event("e1", 1))).resolves.toMatchObject({ title: "Gym" });
    expect(mockDecrypt.mock.calls[0]?.[2]).toBe("event-content:v1");

    await provider.markEventContentBound();

    expect(markStoredEventContentBound).toHaveBeenCalledWith("user-1");
    await expect(provider.hydrateEncryptedEvent(event("e1", 1))).resolves.toMatchObject({
      title: "Encrypted event",
      contentUnavailable: true,
    });
  });

  it("refuses unbound content once the stored marker is set", async () => {
    mockStoredDevice.mockResolvedValue({ eventContentBound: true } as never);

    await expect(
      new WebE2eeProvider().hydrateEncryptedEvent(event("e1", 1)),
    ).resolves.toMatchObject({ contentUnavailable: true });
    expect(mockDecrypt).not.toHaveBeenCalled();
  });
});
