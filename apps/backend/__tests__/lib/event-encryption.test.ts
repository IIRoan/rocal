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
  it("defaults to hybrid mode", () => {
    expect(normalizeEventEncryptionMode(undefined)).toBe("hybrid");
    expect(normalizeEventEncryptionMode("anything-else")).toBe("hybrid");
  });

  it("preserves explicit full mode", () => {
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
        mode: "hybrid",
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

  it("stores hybrid events as fully encrypted when no plaintext dependency exists", () => {
    expect(
      resolveEventPersistencePolicy({
        mode: "hybrid",
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

  it("treats zero-minute reminders as no plaintext dependency", () => {
    expect(
      resolveEventPersistencePolicy({
        mode: "hybrid",
        hasEncryptedPayload: true,
        title: "Planning",
        description: "Discuss roadmap",
        location: "Room 7",
        reminderMinutes: 0,
      }),
    ).toEqual({
      encryptionState: "encrypted",
      title: "",
      description: null,
      location: null,
    });
  });

  it("keeps shadow-write plaintext when reminders require readable content", () => {
    expect(
      resolveEventPersistencePolicy({
        mode: "hybrid",
        hasEncryptedPayload: true,
        title: "Planning",
        description: "Discuss roadmap",
        location: "Room 7",
        reminderMinutes: 30,
      }),
    ).toEqual({
      encryptionState: "shadow_write",
      title: "Planning",
      description: "Discuss roadmap",
      location: "Room 7",
    });
  });

  it("normalizes optional plaintext fields while preserving reminder-backed shadows", () => {
    expect(
      resolveEventPersistencePolicy({
        mode: "hybrid",
        hasEncryptedPayload: true,
        title: "  Planning  ",
        description: "   ",
        location: "  Room 7  ",
        reminderMinutes: 15,
      }),
    ).toEqual({
      encryptionState: "shadow_write",
      title: "Planning",
      description: null,
      location: "Room 7",
    });
  });

  it("keeps shadow-write plaintext when calendar sharing requires readable content", () => {
    expect(
      resolveEventPersistencePolicy({
        mode: "hybrid",
        hasEncryptedPayload: true,
        title: "Planning",
        description: "Discuss roadmap",
        location: "Room 7",
        calendarShareEnabled: true,
      }),
    ).toEqual({
      encryptionState: "shadow_write",
      title: "Planning",
      description: "Discuss roadmap",
      location: "Room 7",
    });
  });

  it("forces ciphertext-only storage in full mode", () => {
    expect(
      resolveEventPersistencePolicy({
        mode: "full",
        hasEncryptedPayload: true,
        title: "Planning",
        description: "Discuss roadmap",
        location: "Room 7",
        reminderMinutes: 30,
        calendarShareEnabled: true,
      }),
    ).toEqual({
      encryptionState: "encrypted",
      title: "",
      description: null,
      location: null,
    });
  });

  it("force-full calendar overrides hybrid mode and reminder shadows", () => {
    expect(
      resolveEventPersistencePolicy({
        mode: "hybrid",
        hasEncryptedPayload: true,
        title: "Planning",
        description: "Discuss roadmap",
        location: "Room 7",
        reminderMinutes: 30,
        calendarShareEnabled: true,
        calendarForceFullEncryption: true,
      }),
    ).toEqual({
      encryptionState: "encrypted",
      title: "",
      description: null,
      location: null,
    });
  });

  it("force-full calendar still requires an encrypted payload before stripping plaintext", () => {
    expect(
      resolveEventPersistencePolicy({
        mode: "hybrid",
        hasEncryptedPayload: false,
        title: "Planning",
        description: "Discuss roadmap",
        location: "Room 7",
        calendarForceFullEncryption: true,
      }),
    ).toEqual({
      encryptionState: "plaintext",
      title: "Planning",
      description: "Discuss roadmap",
      location: "Room 7",
    });
  });

  it("falsy force-full flag preserves hybrid shadow_write behavior", () => {
    expect(
      resolveEventPersistencePolicy({
        mode: "hybrid",
        hasEncryptedPayload: true,
        title: "Planning",
        description: "Discuss roadmap",
        location: "Room 7",
        reminderMinutes: 30,
        calendarForceFullEncryption: false,
      }),
    ).toEqual({
      encryptionState: "shadow_write",
      title: "Planning",
      description: "Discuss roadmap",
      location: "Room 7",
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

  it("re-encrypts a single calendar while preserving reminder-backed shadows when requested", async () => {
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
          preserveReminderDependentShadows: true,
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
        OR: [{ reminder: null }, { reminder: 0 }],
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
    expect(args.where).not.toHaveProperty("OR");
  });
});
