import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@workspace/logger", () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    ok: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    skip: jest.fn(),
    step: jest.fn(),
    child: jest.fn(),
  }),
}));

import { ValidationError } from "../../lib/errors";
import { RecurrenceEngine } from "../../lib/recurrence";
import { RecurringService } from "../../services/recurring.service";

type RecurringEventFixtureInput = Partial<{
  id: string;
  title: string;
  description: string | null;
  allDay: boolean;
  location: string | null;
  color: string | null;
  reminder: number | null;
  recurrence: string | null;
  calendarId: string;
  categoryId: string | null;
  userId: string;
  start: Date;
  end: Date;
}>;

function recurringEventFixture(overrides: RecurringEventFixtureInput = {}) {
  return {
    id: "event-1",
    title: "Weekly sync",
    description: "Team check-in",
    allDay: false,
    location: "Room 7",
    color: "blue",
    reminder: 15,
    recurrence: RecurrenceEngine.createRecurrenceRule({
      frequency: "weekly",
      interval: 1,
      byWeekDay: [2],
    }),
    calendarId: "calendar-1",
    categoryId: "category-1",
    userId: "user-1",
    start: new Date("2026-05-05T09:00:00.000Z"),
    end: new Date("2026-05-05T10:30:00.000Z"),
    createdAt: new Date("2026-04-01T10:00:00.000Z"),
    updatedAt: new Date("2026-04-01T10:00:00.000Z"),
    ...overrides,
  };
}

function createMockPrisma() {
  return {
    calendarEvent: {
      findFirst: jest.fn<() => Promise<any | null>>(async () => null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "event-2",
        ...data,
      })),
      update: jest.fn(async () => ({ id: "event-1" })),
      delete: jest.fn(async () => ({ id: "event-1" })),
      deleteMany: jest.fn(async () => ({ count: 2 })),
    },
    recurrenceException: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "exception-1",
        ...data,
      })),
      findUnique: jest.fn<() => Promise<any | null>>(async () => null),
      update: jest.fn(async () => ({ id: "exception-1" })),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
  };
}

describe("RecurringService", () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let service: RecurringService;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = new RecurringService(mockPrisma as never);
  });

  it("validates recurrence objects and returns their description", () => {
    const result = service.validate({
      frequency: "weekly",
      interval: 1,
      byWeekDay: [1, 3],
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.description).toEqual(expect.any(String));
    expect(result.rule).toEqual(
      expect.objectContaining({ frequency: "weekly", interval: 1 }),
    );
  });

  it("rejects invalid preview requests with a validation error", () => {
    expect(() =>
      service.preview({
        eventStart: "2026-05-01T09:00:00.000Z",
        eventEnd: "2026-05-01T10:00:00.000Z",
        recurrenceRule: "not-json",
      }),
    ).toThrow(
      expect.objectContaining({
        name: "ValidationError",
        field: "recurrenceRule",
        message: "Failed to generate preview",
      } satisfies Partial<ValidationError>),
    );
  });

  it("uses the occurrence date as the default range for this_only edits", async () => {
    mockPrisma.calendarEvent.findFirst.mockResolvedValue(
      recurringEventFixture(),
    );

    await service.editSeries({
      userId: "user-1",
      eventId: "event-1",
      editScope: "this_only",
      occurrenceDate: "2026-05-19T09:00:00.000Z",
      updates: {
        title: "Renamed occurrence",
      },
    });

    expect(mockPrisma.calendarEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "Renamed occurrence",
        parentEventId: "event-1",
        recurrence: null,
        start: new Date("2026-05-19T09:00:00.000Z"),
        end: new Date("2026-05-19T10:30:00.000Z"),
      }),
      include: { category: true, calendar: true },
    });
    expect(mockPrisma.recurrenceException.create).toHaveBeenCalledWith({
      data: {
        parentEventId: "event-1",
        exceptionDate: new Date("2026-05-19T09:00:00.000Z"),
        modifiedEventId: "event-2",
        type: "modified",
      },
    });
  });

  it("preserves duration from the updated start when splitting future occurrences", async () => {
    mockPrisma.calendarEvent.findFirst.mockResolvedValue(
      recurringEventFixture(),
    );

    await service.editSeries({
      userId: "user-1",
      eventId: "event-1",
      editScope: "this_and_future",
      occurrenceDate: "2026-05-19T09:00:00.000Z",
      updates: {
        title: "Afternoon sync",
        start: "2026-05-19T14:00:00.000Z",
      },
    });

    const updatedRuleCalls = mockPrisma.calendarEvent.update.mock
      .calls as unknown as Array<[{ data: { recurrence: string } }]>;
    const createdEventCalls = mockPrisma.calendarEvent.create.mock
      .calls as unknown as Array<[{ data: Record<string, unknown> }]>;
    const updatedRuleCall = updatedRuleCalls[0]?.[0];
    const createdEventCall = createdEventCalls[0]?.[0];

    expect(updatedRuleCall).toBeDefined();
    expect(createdEventCall).toBeDefined();
    if (!updatedRuleCall || !createdEventCall) {
      throw new Error(
        "Expected editSeries to update and create calendar events",
      );
    }

    const updatedRule = RecurrenceEngine.parseRecurrenceRule(
      updatedRuleCall.data.recurrence,
    );

    expect(updatedRule?.until?.toISOString()).toBe("2026-05-18T09:00:00.000Z");
    expect(createdEventCall.data).toEqual(
      expect.objectContaining({
        title: "Afternoon sync",
        parentEventId: "event-1",
        start: new Date("2026-05-19T14:00:00.000Z"),
        end: new Date("2026-05-19T15:30:00.000Z"),
      }),
    );
  });

  it("marks existing occurrence exceptions as deleted when removing one occurrence", async () => {
    mockPrisma.calendarEvent.findFirst.mockResolvedValue(
      recurringEventFixture(),
    );
    mockPrisma.recurrenceException.findUnique.mockResolvedValue({
      id: "exception-1",
      type: "modified",
    });

    const result = await service.deleteSeries({
      userId: "user-1",
      eventId: "event-1",
      deleteScope: "this_only",
      occurrenceDate: "2026-05-19T09:00:00.000Z",
    });

    expect(mockPrisma.recurrenceException.update).toHaveBeenCalledWith({
      where: {
        parentEventId_exceptionDate: {
          parentEventId: "event-1",
          exceptionDate: new Date("2026-05-19T09:00:00.000Z"),
        },
      },
      data: { type: "deleted" },
    });
    expect(result).toEqual({
      success: true,
      message: "Single occurrence deleted successfully",
      deletedEventId: "event-1",
      action: "delete_occurrence",
    });
  });

  it("deletes the whole series including child instances and exceptions", async () => {
    mockPrisma.calendarEvent.findFirst.mockResolvedValue(
      recurringEventFixture(),
    );

    const result = await service.deleteSeries({
      userId: "user-1",
      eventId: "event-1",
      deleteScope: "all",
    });

    expect(mockPrisma.recurrenceException.deleteMany).toHaveBeenCalledWith({
      where: { parentEventId: "event-1" },
    });
    expect(mockPrisma.calendarEvent.deleteMany).toHaveBeenCalledWith({
      where: { parentEventId: "event-1" },
    });
    expect(mockPrisma.calendarEvent.delete).toHaveBeenCalledWith({
      where: { id: "event-1" },
    });
    expect(result.action).toBe("delete_all");
  });
});
