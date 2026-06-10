import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import { CalendarApiService } from "../calendar-api-service";
import { HttpClient } from "../http-client";

describe("CalendarApiService.getEvents", () => {
  let getMock: jest.Mock;
  let service: CalendarApiService;

  beforeEach(() => {
    getMock = jest.fn();
    const client = {
      get: getMock,
    } as unknown as HttpClient;
    service = new CalendarApiService(client);
  });

  it("coerces ISO-string dates with a single HTTP call", async () => {
    getMock.mockResolvedValueOnce({
      events: [
        {
          id: "evt-1",
          title: "Test",
          start: "2026-03-15T10:00:00.000Z",
          end: "2026-03-15T11:00:00.000Z",
        },
      ],
      calendars: [],
      categories: [],
    });

    const result = await service.getEvents(
      new Date("2026-03-01"),
      new Date("2026-03-31"),
    );

    expect(getMock).toHaveBeenCalledTimes(1);
    expect(result.events[0]?.start).toBeInstanceOf(Date);
    expect(result.events[0]?.end).toBeInstanceOf(Date);
  });

  it("passes through Date instances with a single HTTP call", async () => {
    const start = new Date("2026-03-15T10:00:00.000Z");
    const end = new Date("2026-03-15T11:00:00.000Z");
    getMock.mockResolvedValueOnce({
      events: [{ id: "evt-1", title: "Test", start, end }],
      calendars: [],
      categories: [],
    });

    await service.getEvents(new Date("2026-03-01"), new Date("2026-03-31"));

    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it("throws when dates are invalid", async () => {
    getMock.mockResolvedValueOnce({
      events: [{ id: "evt-1", title: "Test", start: "not-a-date", end: "2026-03-15T11:00:00.000Z" }],
      calendars: [],
      categories: [],
    });

    await expect(
      service.getEvents(new Date("2026-03-01"), new Date("2026-03-31")),
    ).rejects.toMatchObject({ statusCode: 502 });
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it("throws when events array is missing", async () => {
    getMock.mockResolvedValueOnce({ calendars: [], categories: [] });

    await expect(
      service.getEvents(new Date("2026-03-01"), new Date("2026-03-31")),
    ).rejects.toMatchObject({ statusCode: 502 });
  });

  it("throws when an event entry is null", async () => {
    getMock.mockResolvedValueOnce({
      events: [null],
      calendars: [],
      categories: [],
    });

    await expect(
      service.getEvents(new Date("2026-03-01"), new Date("2026-03-31")),
    ).rejects.toMatchObject({ statusCode: 502 });
  });

  it("throws when event dates are null", async () => {
    getMock.mockResolvedValueOnce({
      events: [{ id: "evt-1", title: "Test", start: null, end: null }],
      calendars: [],
      categories: [],
    });

    await expect(
      service.getEvents(new Date("2026-03-01"), new Date("2026-03-31")),
    ).rejects.toMatchObject({ statusCode: 502 });
  });
});
