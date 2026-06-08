import { describe, expect, it, jest } from "@jest/globals";

import {
  backfillEncryptedEventsToCiphertextOnly,
  isEventFullyEncrypted,
  normalizeEventEncryptionMode,
  resolveEventPersistencePolicy,
} from "../../lib/event-encryption";

type MockUpdateManyArgs = {
  where: Record<string, unknown>;
  data: Record<string, unknown>;
};

describe("event encryption policy", () => {
  it("always normalizes to full mode", () => {
    expect(normalizeEventEncryptionMode(undefined)).toBe("full");
    expect(normalizeEventEncryptionMode("hybrid")).toBe("full");
    expect(normalizeEventEncryptionMode("full")).toBe("full");
  });

  it("recognizes fully encrypted rows", () => {
    expect(isEventFullyEncrypted("encrypted")).toBe(true);
    expect(isEventFullyEncrypted("shadow_write")).toBe(false);
    expect(isEventFullyEncrypted(null)).toBe(false);
  });

  it("keeps plaintext when no encrypted payload exists", () => {
    expect(
      resolveEventPersistencePolicy({
        hasEncryptedPayload: false,
        title: "Planning",
        description: "Discuss roadmap",
        location: "Room 7",
      }),
    ).toEqual({
      encryptionState: "plaintext",
      title: "Planning",
      description: "Discuss roadmap",
      location: "Room 7",
    });
  });

  it("stores encrypted events as ciphertext only", () => {
    expect(
      resolveEventPersistencePolicy({
        hasEncryptedPayload: true,
        title: "Planning",
        description: "Discuss roadmap",
        location: "Room 7",
      }),
    ).toEqual({
      encryptionState: "encrypted",
      title: "",
      description: null,
      location: null,
    });
  });

  it("normalizes optional plaintext fields before encryption", () => {
    expect(
      resolveEventPersistencePolicy({
        hasEncryptedPayload: true,
        title: "  Planning  ",
        description: "   ",
        location: "  Room 7  ",
      }),
    ).toEqual({
      encryptionState: "encrypted",
      title: "",
      description: null,
      location: null,
    });
  });
});

describe("backfillEncryptedEventsToCiphertextOnly", () => {
  it("returns early when no calendar scope is provided", async () => {
    const updateMany =
      jest.fn<(args: MockUpdateManyArgs) => Promise<{ count: number }>>();

    await expect(
      backfillEncryptedEventsToCiphertextOnly(
        { calendarEvent: { updateMany } } as never,
        { userId: "user-1" },
      ),
    ).resolves.toBe(0);

    expect(updateMany).not.toHaveBeenCalled();
  });

  it("re-encrypts a single calendar", async () => {
    const now = new Date("2026-04-24T10:00:00.000Z");
    const updateMany =
      jest.fn<(args: MockUpdateManyArgs) => Promise<{ count: number }>>();

    updateMany.mockResolvedValue({ count: 2 });

    await expect(
      backfillEncryptedEventsToCiphertextOnly(
        { calendarEvent: { updateMany } } as never,
        {
          userId: "user-1",
          calendarId: "cal-1",
          now,
        },
      ),
    ).resolves.toBe(2);

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        calendarId: "cal-1",
        encryptedContent: { not: null },
        encryptionState: { not: "encrypted" },
      },
      data: {
        title: "",
        description: null,
        location: null,
        encryptionState: "encrypted",
        updatedAt: now,
      },
    });
  });

  it("uses an in-clause and deduplicates calendar ids for multi-calendar reencryption", async () => {
    const updateMany =
      jest.fn<(args: MockUpdateManyArgs) => Promise<{ count: number }>>();

    updateMany.mockResolvedValue({ count: 3 });

    await expect(
      backfillEncryptedEventsToCiphertextOnly(
        { calendarEvent: { updateMany } } as never,
        {
          userId: "user-1",
          calendarId: "cal-2",
          calendarIds: ["cal-1", "cal-2", "cal-1"],
        },
      ),
    ).resolves.toBe(3);

    expect(updateMany).toHaveBeenCalledTimes(1);

    const args = updateMany.mock.calls[0]?.[0];

    expect(args).toBeDefined();

    if (!args) {
      throw new Error("Expected updateMany to be called once");
    }

    expect(args).toMatchObject({
      where: {
        userId: "user-1",
        calendarId: { in: ["cal-1", "cal-2"] },
        encryptedContent: { not: null },
        encryptionState: { not: "encrypted" },
      },
      data: {
        title: "",
        description: null,
        location: null,
        encryptionState: "encrypted",
        updatedAt: expect.any(Date),
      },
    });
  });
});
