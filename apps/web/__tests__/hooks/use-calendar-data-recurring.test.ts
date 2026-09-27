import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../lib/calendar-api-service", () => ({
  calendarApiService: {
    deleteEvent: jest.fn(),
    deleteRecurringEvent: jest.fn(),
    editRecurringEvent: jest.fn(),
    getEvent: jest.fn(),
    updateEvent: jest.fn(),
  },
}));

jest.mock("../../lib/e2ee-notification-title", () => ({
  encryptReminderTitle: jest.fn(),
}));

jest.mock("@workspace/logger", () => ({
  createLogger: () => ({
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  }),
}));

import { calendarApiService } from "../../lib/calendar-api-service";
import type { CalendarEvent } from "../../lib/types/calendar";
import {
  persistRecurringEventDelete,
  persistRecurringEventEdit,
} from "../../hooks/use-calendar-data";

const api = jest.mocked(calendarApiService);

const occurrence = {
  id: "series-1_2026-06-08T09:00:00.000Z",
  parentEventId: "series-1",
  isRecurringInstance: true,
  title: "Standup",
  calendarId: "cal-1",
  userId: "user-1",
  allDay: false,
  start: new Date("2026-06-08T09:00:00.000Z"),
  end: new Date("2026-06-08T09:30:00.000Z"),
  createdAt: new Date("2026-05-01T00:00:00.000Z"),
  updatedAt: new Date("2026-05-01T00:00:00.000Z"),
} as CalendarEvent;

const moveUpdates = {
  start: "2026-06-08T10:00:00.000Z",
  end: "2026-06-08T10:30:00.000Z",
  allDay: false,
  timezone: "Europe/Amsterdam",
};

describe("persistRecurringEventEdit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.editRecurringEvent.mockResolvedValue({ id: "result" } as never);
    api.updateEvent.mockResolvedValue({ id: "result" } as never);
  });

  it("edits a single occurrence with its original date and the strict update shape", async () => {
    await persistRecurringEventEdit({
      event: occurrence,
      scope: "this_only",
      updates: { ...moveUpdates, reminder: null, participants: [] },
    });

    expect(api.editRecurringEvent).toHaveBeenCalledWith("series-1", {
      editScope: "this_only",
      occurrenceDate: "2026-06-08T09:00:00.000Z",
      updates: {
        start: "2026-06-08T10:00:00.000Z",
        end: "2026-06-08T10:30:00.000Z",
        allDay: false,
        timezone: "Europe/Amsterdam",
        participants: [],
      },
    });
  });

  it("splits the series for this and following events", async () => {
    await persistRecurringEventEdit({
      event: occurrence,
      scope: "this_and_future",
      updates: { title: "Renamed" },
    });

    expect(api.editRecurringEvent).toHaveBeenCalledWith("series-1", {
      editScope: "this_and_future",
      occurrenceDate: "2026-06-08T09:00:00.000Z",
      updates: { title: "Renamed" },
    });
  });

  it("shifts the series anchor by the occurrence delta for all events", async () => {
    api.getEvent.mockResolvedValue({
      id: "series-1",
      start: "2026-06-01T09:00:00.000Z",
      end: "2026-06-01T09:30:00.000Z",
    } as never);

    await persistRecurringEventEdit({
      event: occurrence,
      scope: "all",
      updates: moveUpdates,
    });

    expect(api.getEvent).toHaveBeenCalledWith("series-1");
    expect(api.editRecurringEvent).toHaveBeenCalledWith("series-1", {
      editScope: "all",
      occurrenceDate: undefined,
      updates: {
        allDay: false,
        start: "2026-06-01T10:00:00.000Z",
        end: "2026-06-01T10:30:00.000Z",
        timezone: "Europe/Amsterdam",
      },
    });
  });

  it("updates an already detached occurrence in place for this event only", async () => {
    const detached = {
      ...occurrence,
      id: "exception-1",
      isRecurringInstance: false,
    };

    await persistRecurringEventEdit({
      event: detached,
      scope: "this_only",
      updates: moveUpdates,
    });

    expect(api.updateEvent).toHaveBeenCalledWith("exception-1", moveUpdates);
    expect(api.editRecurringEvent).not.toHaveBeenCalled();
  });
});

describe("persistRecurringEventDelete", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.deleteRecurringEvent.mockResolvedValue(undefined as never);
    api.deleteEvent.mockResolvedValue(undefined as never);
  });

  it.each([
    ["this_only", "2026-06-08T09:00:00.000Z"],
    ["this_and_future", "2026-06-08T09:00:00.000Z"],
    ["all", undefined],
  ] as const)("deletes with the %s scope", async (scope, occurrenceDate) => {
    await persistRecurringEventDelete({ event: occurrence, scope });

    expect(api.deleteRecurringEvent).toHaveBeenCalledWith(
      "series-1",
      scope,
      occurrenceDate,
    );
  });

  it("deletes a detached occurrence row for this event only", async () => {
    await persistRecurringEventDelete({
      event: { ...occurrence, id: "exception-1", isRecurringInstance: false },
      scope: "this_only",
    });

    expect(api.deleteEvent).toHaveBeenCalledWith("exception-1");
    expect(api.deleteRecurringEvent).not.toHaveBeenCalled();
  });
});
