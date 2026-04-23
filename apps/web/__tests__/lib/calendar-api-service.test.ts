import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../lib/http-client", () => ({
  httpClient: {},
  HttpClient: class HttpClient {},
}));

jest.mock("../../lib/e2ee-payloads", () => ({
  attachCalendarEncryptionShadow: jest.fn(),
  attachCategoryEncryptionShadow: jest.fn(),
  attachEventEncryptionShadow: jest.fn(),
}));

jest.mock("../../lib/e2ee-session", () => ({
  getActiveE2eeSession: jest.fn(),
}));

jest.mock("../../lib/e2ee-bootstrap", () => ({
  waitForPendingE2eeBootstrap: jest.fn(),
}));

jest.mock("../../lib/e2ee-crypto", () => ({
  createBlindIndexTokens: jest.fn(),
  decryptJsonPayload: jest.fn(),
}));

import {
  attachCalendarEncryptionShadow,
  attachCategoryEncryptionShadow,
  attachEventEncryptionShadow,
} from "../../lib/e2ee-payloads";
import { waitForPendingE2eeBootstrap } from "../../lib/e2ee-bootstrap";
import { createBlindIndexTokens, decryptJsonPayload } from "../../lib/e2ee-crypto";
import { getActiveE2eeSession } from "../../lib/e2ee-session";
import { CalendarApiService } from "../../lib/calendar-api-service";

const mockAttachCalendarEncryptionShadow =
  attachCalendarEncryptionShadow as jest.MockedFunction<
    typeof attachCalendarEncryptionShadow
  >;
const mockAttachCategoryEncryptionShadow =
  attachCategoryEncryptionShadow as jest.MockedFunction<
    typeof attachCategoryEncryptionShadow
  >;
const mockAttachEventEncryptionShadow =
  attachEventEncryptionShadow as jest.MockedFunction<
    typeof attachEventEncryptionShadow
  >;
const mockGetActiveE2eeSession =
  getActiveE2eeSession as jest.MockedFunction<typeof getActiveE2eeSession>;
const mockWaitForPendingE2eeBootstrap =
  waitForPendingE2eeBootstrap as jest.MockedFunction<
    typeof waitForPendingE2eeBootstrap
  >;
const mockCreateBlindIndexTokens =
  createBlindIndexTokens as jest.MockedFunction<typeof createBlindIndexTokens>;
const mockDecryptJsonPayload =
  decryptJsonPayload as jest.MockedFunction<typeof decryptJsonPayload>;

describe("CalendarApiService encryption wrappers", () => {
  let client: {
    get: jest.Mock;
    post: jest.Mock;
    put: jest.Mock;
    delete: jest.Mock;
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
    service = new CalendarApiService(client as any);
    mockWaitForPendingE2eeBootstrap.mockReturnValue(null);
    mockGetActiveE2eeSession.mockReturnValue({
      accountKey: {} as CryptoKey,
      blindIndexKey: {} as CryptoKey,
    } as any);
    mockCreateBlindIndexTokens.mockResolvedValue(["idx-1", "idx-2"]);
    mockDecryptJsonPayload.mockResolvedValue({
      title: "Decrypted event",
      description: "Hidden agenda",
      location: "Room 7",
    } as never);
  });

  it("posts attached event payloads on create", async () => {
    const request = {
      title: "Event",
      start: "2026-05-01T10:00:00.000Z",
      end: "2026-05-01T11:00:00.000Z",
      calendarId: "cal-1",
    };
    const payload = { ...request, encryptedContent: "ciphertext" };
    mockAttachEventEncryptionShadow.mockResolvedValue(payload as any);
    client.post.mockResolvedValue({ id: "event-1" } as never);

    await service.createEvent(request as any);

    expect(mockAttachEventEncryptionShadow).toHaveBeenCalledWith(request);
    expect(client.post).toHaveBeenCalledWith("/api/events", payload);
  });

  it("puts attached event payloads on update", async () => {
    const request = { title: "Event" };
    const payload = { ...request, encryptedContent: "ciphertext" };
    mockAttachEventEncryptionShadow.mockResolvedValue(payload as any);
    client.put.mockResolvedValue({ id: "event-1" } as never);

    await service.updateEvent("event-1", request as any);

    expect(mockAttachEventEncryptionShadow).toHaveBeenCalledWith(request);
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

    expect(mockDecryptJsonPayload).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        title: "Decrypted event",
        description: "Hidden agenda",
        location: "Room 7",
        encryptedContent: null,
        blindIndexTokens: null,
      }),
    );
  });

  it("waits for bootstrap before decrypting encrypted event reads", async () => {
    let session: { accountKey: CryptoKey; blindIndexKey: CryptoKey } | null =
      null;
    mockGetActiveE2eeSession.mockImplementation(() => session as any);
    mockWaitForPendingE2eeBootstrap.mockImplementation(
      () =>
        Promise.resolve().then(() => {
          session = {
            accountKey: {} as CryptoKey,
            blindIndexKey: {} as CryptoKey,
          };
          return true;
        }) as Promise<boolean>,
    );
    client.get.mockResolvedValue({
      id: "event-1",
      title: "",
      encryptedContent: JSON.stringify({ iv: "iv", ciphertext: "ciphertext" }),
      encryptionState: "encrypted",
      start: new Date("2026-05-01T10:00:00.000Z"),
      end: new Date("2026-05-01T11:00:00.000Z"),
      calendarId: "cal-1",
      userId: "user-1",
      createdAt: new Date("2026-04-01T10:00:00.000Z"),
      updatedAt: new Date("2026-04-01T10:00:00.000Z"),
    } as never);

    const result = await service.getEvent("event-1");

    expect(mockWaitForPendingE2eeBootstrap).toHaveBeenCalled();
    expect(mockDecryptJsonPayload).toHaveBeenCalled();
    expect(result.title).toBe("Decrypted event");
  });

  it("normalizes encrypted events when no session is available", async () => {
    mockGetActiveE2eeSession.mockReturnValue(null);
    mockWaitForPendingE2eeBootstrap.mockReturnValue(null);
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
    expect(mockDecryptJsonPayload).not.toHaveBeenCalled();
  });

  it("normalizes encrypted events when decryption fails", async () => {
    mockDecryptJsonPayload.mockRejectedValueOnce(new Error("decrypt failed") as never);
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

    expect(mockCreateBlindIndexTokens).toHaveBeenCalledWith(
      expect.any(Object),
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
    expect(mockDecryptJsonPayload).not.toHaveBeenCalled();
  });

  it("posts attached calendar payloads on create", async () => {
    const request = { name: "Work", color: "blue" };
    const payload = { ...request, encryptedName: "ciphertext" };
    mockAttachCalendarEncryptionShadow.mockResolvedValue(payload as any);
    client.post.mockResolvedValue({ id: "cal-1" } as never);

    await service.createCalendar(request as any);

    expect(mockAttachCalendarEncryptionShadow).toHaveBeenCalledWith(request);
    expect(client.post).toHaveBeenCalledWith("/api/calendars", payload);
  });

  it("puts attached calendar payloads on update", async () => {
    const request = { name: "Work" };
    const payload = { ...request, encryptedName: "ciphertext" };
    mockAttachCalendarEncryptionShadow.mockResolvedValue(payload as any);
    client.put.mockResolvedValue({ id: "cal-1" } as never);

    await service.updateCalendar("cal-1", request as any);

    expect(mockAttachCalendarEncryptionShadow).toHaveBeenCalledWith(request);
    expect(client.put).toHaveBeenCalledWith("/api/calendars/cal-1", payload);
  });

  it("posts attached category payloads on create", async () => {
    const request = { name: "Personal", color: "emerald" };
    const payload = { ...request, encryptedName: "ciphertext" };
    mockAttachCategoryEncryptionShadow.mockResolvedValue(payload as any);
    client.post.mockResolvedValue({ id: "cat-1" } as never);

    await service.createCategory(request as any);

    expect(mockAttachCategoryEncryptionShadow).toHaveBeenCalledWith(request);
    expect(client.post).toHaveBeenCalledWith("/api/categories", payload);
  });

  it("puts attached category payloads on update", async () => {
    const request = { name: "Personal" };
    const payload = { ...request, encryptedName: "ciphertext" };
    mockAttachCategoryEncryptionShadow.mockResolvedValue(payload as any);
    client.put.mockResolvedValue({ id: "cat-1" } as never);

    await service.updateCategory("cat-1", request as any);

    expect(mockAttachCategoryEncryptionShadow).toHaveBeenCalledWith(request);
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