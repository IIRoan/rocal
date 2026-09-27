import { describe, expect, it, jest } from "@jest/globals";
import { importIcsSubscriptionBodySchema } from "../../contracts/subscription.contract";
import { SubscriptionService } from "../../services/subscription.service";

const entry = {
  externalId: "opaque-id",
  encryptedContent: "ciphertext",
  blindIndexTokens: ["token"],
  encryptionKeyVersion: 1,
  start: "2026-06-01T09:00:00.000Z",
  end: "2026-06-01T10:00:00.000Z",
  timezone: "UTC",
  allDay: false,
  excludedDates: [],
};

function setup() {
  const db = {
    calendar: {
      findFirst: jest.fn<
        () => Promise<{ id: string; kind: string; isSyncOnly: boolean } | null>
      >(async () => ({
        id: "cal",
        kind: "owned",
        isSyncOnly: false,
      })),
    },
    calendarEvent: {
      findFirst: jest.fn<() => Promise<{ id: string } | null>>(
        async () => null,
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "event",
        ...data,
      })),
    },
    recurrenceException: {
      create: jest.fn(async () => ({})),
      upsert: jest.fn(async () => ({})),
    },
  };
  const prisma = {
    ...db,
    $transaction: async <T>(work: (tx: typeof db) => Promise<T>) => work(db),
  };
  const participants = { syncParticipants: jest.fn(async () => ({})) };
  return {
    db,
    participants,
    service: new SubscriptionService(prisma as never, participants as never),
  };
}

describe("encrypted ICS import", () => {
  it("rejects inaccessible calendars before creating events", async () => {
    const { db, service } = setup();
    db.calendar.findFirst.mockResolvedValue(null);
    await expect(
      service.importIcs({
        userId: "user",
        calendarId: "cal",
        encryptedEvents: [entry],
      }),
    ).rejects.toMatchObject({ name: "NotFoundError" });
    expect(db.calendarEvent.create).not.toHaveBeenCalled();
  });

  it("links an imported override to its series and suppresses the original occurrence", async () => {
    const { db, service } = setup();
    db.calendarEvent.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "series" });
    await service.importIcs({
      userId: "user",
      calendarId: "cal",
      encryptedEvents: [
        {
          ...entry,
          seriesExternalId: "series-token",
          occurrenceDate: entry.start,
        },
      ],
    });
    expect(db.calendarEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        parentEventId: "series",
        recurrence: null,
      }),
    });
    expect(db.recurrenceException.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          parentEventId: "series",
          modifiedEventId: "event",
          type: "modified",
          exceptionDate: new Date(entry.start),
        },
      }),
    );
  });

  it("stores only ciphertext and scopes deduplication by owner and calendar", async () => {
    const { db, service, participants } = setup();
    expect(
      await service.importIcs({
        userId: "user",
        calendarId: "cal",
        encryptedEvents: [entry],
      }),
    ).toMatchObject({ eventsCreated: 1 });
    expect(db.calendar.findFirst).toHaveBeenCalledWith({
      where: { id: "cal", userId: "user" },
    });
    expect(db.calendarEvent.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "user",
        calendarId: "cal",
        externalId: "opaque-id",
        isSynced: false,
      },
    });
    expect(db.calendarEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "",
        description: null,
        location: null,
        encryptedContent: "ciphertext",
        encryptionState: "encrypted",
      }),
    });
    expect(participants.syncParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ sendInvitations: false }),
    );
  });

  it("skips duplicates without overwriting existing events", async () => {
    const { db, service } = setup();
    db.calendarEvent.findFirst.mockResolvedValue({ id: "existing" });
    expect(
      await service.importIcs({
        userId: "user",
        calendarId: "cal",
        encryptedEvents: [entry],
      }),
    ).toMatchObject({ eventsCreated: 0 });
    expect(db.calendarEvent.create).not.toHaveBeenCalled();
  });

  it("rejects plaintext alongside encrypted events and keeps legacy clients compatible", () => {
    expect(
      importIcsSubscriptionBodySchema.safeParse({
        calendarId: "cal",
        encryptedEvents: [{ ...entry, title: "secret" }],
      }).success,
    ).toBe(false);
    expect(
      importIcsSubscriptionBodySchema.safeParse({
        calendarId: "cal",
        encryptedEvents: [entry],
        icsContent: "secret",
      }).success,
    ).toBe(false);
    expect(
      importIcsSubscriptionBodySchema.safeParse({
        calendarId: "cal",
        icsContent: "legacy",
      }).success,
    ).toBe(true);
  });
});
