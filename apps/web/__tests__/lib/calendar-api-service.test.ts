import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { CalendarApiService } from "../../lib/calendar-api-service";
import type { E2eeProvider } from "@workspace/calendar-client";

describe("CalendarApiService encryption wrappers", () => {
  let client: {
    get: jest.Mock;
    post: jest.Mock;
    put: jest.Mock;
    delete: jest.Mock;
  };
  let mockE2ee: {
    attachEventEncryptionShadow: jest.Mock<(req: any) => Promise<any>>;
    attachCalendarEncryptionShadow: jest.Mock<(req: any) => Promise<any>>;
    attachCategoryEncryptionShadow: jest.Mock<(req: any) => Promise<any>>;
    hydrateEncryptedEvent: jest.Mock<(event: any) => Promise<any>>;
    hydrateEncryptedEvents: jest.Mock<(events: any[]) => Promise<any[]>>;
    createBlindIndexTokens: jest.Mock<(value: string) => Promise<string[]>>;
  };
  let service: CalendarApiService;

  beforeEach(() => {
    jest.clearAllMocks();
    client = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    };
    mockE2ee = {
      attachEventEncryptionShadow: jest.fn((req: any) => Promise.resolve(req)),
      attachCalendarEncryptionShadow: jest.fn((req: any) => Promise.resolve(req)),
      attachCategoryEncryptionShadow: jest.fn((req: any) => Promise.resolve(req)),
      hydrateEncryptedEvent: jest.fn((event: any) => Promise.resolve({
        ...event,
        title: "Decrypted event",
        description: "Hidden agenda",
        location: "Room 7",
      })),
      hydrateEncryptedEvents: jest.fn((events: any[]) =>
        Promise.all(events.map((e: any) => mockE2ee.hydrateEncryptedEvent(e))),
      ),
      createBlindIndexTokens: jest.fn(() => Promise.resolve(["idx-1", "idx-2"])),
    };
    service = new CalendarApiService(
      client as any,
      mockE2ee as unknown as E2eeProvider,
    );
  });

  it("posts attached event payloads on create", async () => {
    const request = {
      title: "Event",
      start: "2026-05-01T10:00:00.000Z",
      end: "2026-05-01T11:00:00.000Z",
      calendarId: "cal-1",
    };
    const payload = { ...request, encryptedContent: "ciphertext" };
    mockE2ee.attachEventEncryptionShadow.mockResolvedValue(payload);
    client.post.mockResolvedValue({ id: "event-1" } as never);

    await service.createEvent(request as any);

    expect(mockE2ee.attachEventEncryptionShadow).toHaveBeenCalledWith(request);
    expect(client.post).toHaveBeenCalledWith("/api/events", payload);
  });

  it("puts attached event payloads on update", async () => {
    const request = { title: "Event" };
    const payload = { ...request, encryptedContent: "ciphertext" };
    mockE2ee.attachEventEncryptionShadow.mockResolvedValue(payload);
    client.put.mockResolvedValue({ id: "event-1" } as never);

    await service.updateEvent("event-1", request as any);

    expect(mockE2ee.attachEventEncryptionShadow).toHaveBeenCalledWith(request);
    expect(client.put).toHaveBeenCalledWith("/api/events/event-1", payload);
  });

  it("decrypts encrypted events on reads", async () => {
    client.get.mockResolvedValue({
      id: "event-1",
      title: "",
      encryptedContent: JSON.stringify({ iv: "iv", ciphertext: "ciphertext" }),
      blindIndexTokens: ["idx-1"],
      encryptionState: "encrypted",
      start: new Date("2026-05-01T10:00:00.000Z"),
      end: new Date("2026-05-01T11:00:00.000Z"),
      calendarId: "cal-1",
      userId: "user-1",
      createdAt: new Date("2026-04-01T10:00:00.000Z"),
      updatedAt: new Date("2026-04-01T10:00:00.000Z"),
    } as never);

    const result = await service.getEvent("event-1");

    expect(mockE2ee.hydrateEncryptedEvent).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        title: "Decrypted event",
        encryptedContent: null,
        blindIndexTokens: null,
      }),
    );
  });

  it("normalizes encrypted events when no session is available", async () => {
    // E2EE provider returns placeholder when no session
    mockE2ee.hydrateEncryptedEvent.mockImplementation((event: any) =>
      Promise.resolve({
        ...event,
        title: "Encrypted event",
        description: null,
        location: null,
        encryptionState: "encrypted",
      }),
    );
    client.get.mockResolvedValue({
      id: "event-1",
      title: "",
      encryptedContent: JSON.stringify({ iv: "iv", ciphertext: "ciphertext" }),
      blindIndexTokens: ["idx-1"],
      encryptionState: "encrypted",
      start: new Date("2026-05-01T10:00:00.000Z"),
      end: new Date("2026-05-01T11:00:00.000Z"),
      calendarId: "cal-1",
      userId: "user-1",
      createdAt: new Date("2026-04-01T10:00:00.000Z"),
      updatedAt: new Date("2026-04-01T10:00:00.000Z"),
    } as never);

    const result = await service.getEvent("event-1");

    expect(result).toEqual(
      expect.objectContaining({
        title: "Encrypted event",
        encryptionState: "encrypted",
        encryptedContent: null,
        blindIndexTokens: null,
        description: null,
        location: null,
      }),
    );
  });

  it("normalizes encrypted events when decryption fails", async () => {
    mockE2ee.hydrateEncryptedEvent.mockRejectedValueOnce(
      new Error("decrypt failed"),
    );
    client.get.mockResolvedValue({
      id: "event-1",
      title: "",
      encryptedContent: JSON.stringify({ iv: "iv", ciphertext: "ciphertext" }),
      blindIndexTokens: ["idx-1"],
      encryptionState: "encrypted",
      start: new Date("2026-05-01T10:00:00.000Z"),
      end: new Date("2026-05-01T11:00:00.000Z"),
      calendarId: "cal-1",
      userId: "user-1",
      createdAt: new Date("2026-04-01T10:00:00.000Z"),
      updatedAt: new Date("2026-04-01T10:00:00.000Z"),
    } as never);

    const result = await service.getEvent("event-1");

    expect(result).toEqual(
      expect.objectContaining({
        title: "Encrypted event",
        encryptionState: "encrypted",
        encryptedContent: null,
        blindIndexTokens: null,
      }),
    );
  });

  it("adds blind-index search tokens and decrypts search results", async () => {
    client.get.mockResolvedValue({
      events: [
        {
          id: "event-1",
          title: "",
          encryptedContent: JSON.stringify({ iv: "iv", ciphertext: "ciphertext" }),
          blindIndexTokens: ["idx-1"],
          encryptionState: "encrypted",
          start: new Date("2026-05-01T10:00:00.000Z"),
          end: new Date("2026-05-01T11:00:00.000Z"),
          calendarId: "cal-1",
          userId: "user-1",
          createdAt: new Date("2026-04-01T10:00:00.000Z"),
          updatedAt: new Date("2026-04-01T10:00:00.000Z"),
        },
      ],
      total: 1,
    } as never);

    const result = await service.searchEvents({ q: "secret event" });

    expect(mockE2ee.createBlindIndexTokens).toHaveBeenCalledWith(
      "secret event",
    );
    expect(client.get).toHaveBeenCalledWith(
      "/api/events/search?q=secret+event&blindIndexTokens=idx-1%2Cidx-2",
      { signal: undefined },
    );
    expect(result.events[0]).toEqual(
      expect.objectContaining({
        title: "Decrypted event",
        encryptedContent: null,
        blindIndexTokens: null,
      }),
    );
  });

  it("normalizes shadow-write events for UI renders", async () => {
    // For non-encrypted events, hydrateEncryptedEvent should not be called
    // because encryptionState is not "encrypted"
    client.get.mockResolvedValue({
      id: "event-1",
      title: "Visible title",
      encryptedContent: JSON.stringify({ iv: "iv", ciphertext: "ciphertext" }),
      blindIndexTokens: ["idx-1"],
      start: new Date("2026-05-01T10:00:00.000Z"),
      end: new Date("2026-05-01T11:00:00.000Z"),
      calendarId: "cal-1",
      userId: "user-1",
      createdAt: new Date("2026-04-01T10:00:00.000Z"),
      updatedAt: new Date("2026-04-01T10:00:00.000Z"),
    } as never);

    const result = await service.getEvent("event-1");

    expect(result).toEqual(
      expect.objectContaining({
        title: "Visible title",
        encryptionState: "shadow_write",
        encryptedContent: null,
        blindIndexTokens: null,
      }),
    );
  });

  it("posts attached calendar payloads on create", async () => {
    const request = { name: "Work", color: "blue" };
    const payload = { ...request, encryptedName: "ciphertext" };
    mockE2ee.attachCalendarEncryptionShadow.mockResolvedValue(payload);
    client.post.mockResolvedValue({ id: "cal-1" } as never);

    await service.createCalendar(request as any);

    expect(mockE2ee.attachCalendarEncryptionShadow).toHaveBeenCalledWith(
      request,
    );
    expect(client.post).toHaveBeenCalledWith("/api/calendars", payload);
  });

  it("puts attached calendar payloads on update", async () => {
    const request = { name: "Work" };
    const payload = { ...request, encryptedName: "ciphertext" };
    mockE2ee.attachCalendarEncryptionShadow.mockResolvedValue(payload);
    client.put.mockResolvedValue({ id: "cal-1" } as never);

    await service.updateCalendar("cal-1", request as any);

    expect(mockE2ee.attachCalendarEncryptionShadow).toHaveBeenCalledWith(
      request,
    );
    expect(client.put).toHaveBeenCalledWith("/api/calendars/cal-1", payload);
  });

  it("posts attached category payloads on create", async () => {
    const request = { name: "Personal", color: "emerald" };
    const payload = { ...request, encryptedName: "ciphertext" };
    mockE2ee.attachCategoryEncryptionShadow.mockResolvedValue(payload);
    client.post.mockResolvedValue({ id: "cat-1" } as never);

    await service.createCategory(request as any);

    expect(mockE2ee.attachCategoryEncryptionShadow).toHaveBeenCalledWith(
      request,
    );
    expect(client.post).toHaveBeenCalledWith("/api/categories", payload);
  });

  it("puts attached category payloads on update", async () => {
    const request = { name: "Personal" };
    const payload = { ...request, encryptedName: "ciphertext" };
    mockE2ee.attachCategoryEncryptionShadow.mockResolvedValue(payload);
    client.put.mockResolvedValue({ id: "cat-1" } as never);

    await service.updateCategory("cat-1", request as any);

    expect(mockE2ee.attachCategoryEncryptionShadow).toHaveBeenCalledWith(
      request,
    );
    expect(client.put).toHaveBeenCalledWith("/api/categories/cat-1", payload);
  });

  it("normalizes calendars for UI renders", async () => {
    client.get.mockResolvedValue({
      calendars: [
        {
          id: "cal-1",
          name: "Work",
          encryptedName: "ciphertext",
          blindIndexTokens: ["idx-1"],
          color: "blue",
          kind: "owned",
          isPublic: false,
          isVisible: true,
          isDefault: false,
          isSyncOnly: false,
          userId: "user-1",
          createdAt: new Date("2026-04-01T10:00:00.000Z"),
          updatedAt: new Date("2026-04-01T10:00:00.000Z"),
        },
      ],
    } as never);

    const result = await service.getCalendars();

    expect(result).toEqual([
      expect.objectContaining({
        id: "cal-1",
        encryptionState: "shadow_write",
        encryptedName: null,
        blindIndexTokens: null,
      }),
    ]);
  });

  it("normalizes categories for UI renders", async () => {
    client.get.mockResolvedValue({
      categories: [
        {
          id: "cat-1",
          name: "Personal",
          encryptedName: "ciphertext",
          blindIndexTokens: ["idx-1"],
          color: "emerald",
          isActive: true,
          userId: "user-1",
          createdAt: new Date("2026-04-01T10:00:00.000Z"),
          updatedAt: new Date("2026-04-01T10:00:00.000Z"),
        },
      ],
    } as never);

    const result = await service.getCategories();

    expect(result).toEqual([
      expect.objectContaining({
        id: "cat-1",
        encryptionState: "shadow_write",
        encryptedName: null,
        blindIndexTokens: null,
      }),
    ]);
  });
});
