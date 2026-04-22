import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import { Elysia } from "elysia";

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

jest.mock("@workspace/calendar-ics", () => ({
  buildIcsEventFile: jest.fn(),
  findNationalHolidayCalendarByUrl: jest.fn(),
}));

jest.mock("../../lib/prisma", () => ({
  prisma: {
    calendarEvent: {
      findMany: jest.fn(async (): Promise<any> => []),
      findFirst: jest.fn(async (): Promise<any> => null),
      create: jest.fn(async (): Promise<any> => null),
      update: jest.fn(async (): Promise<any> => null),
      delete: jest.fn(async (): Promise<any> => null),
    },
    calendar: {
      findFirst: jest.fn(async (): Promise<any> => null),
      findMany: jest.fn(async (): Promise<any> => []),
    },
    eventCategory: {
      findFirst: jest.fn(async (): Promise<any> => null),
      findMany: jest.fn(async (): Promise<any> => []),
    },
    eventNotification: {
      create: jest.fn(async (): Promise<any> => null),
      deleteMany: jest.fn(async (): Promise<any> => ({ count: 0 })),
    },
    recurrenceException: {
      create: jest.fn(async (): Promise<any> => null),
    },
    userSettings: {
      findUnique: jest.fn(async (): Promise<any> => ({
        timezone: "UTC",
        eventEncryptionMode: "hybrid",
        emailNotifications: true,
      })),
    },
  },
}));

jest.mock("../../lib/auth-utils", () => ({
  ensureAuthenticatedUser: jest.fn(async (): Promise<any> => ({
    id: "user-1",
  })),
}));

jest.mock("../../lib/auth", () => ({
  auth: { api: { getSession: jest.fn() } },
}));

jest.mock("../../lib/auth-guard", () => {
  const { Elysia: LocalElysia } =
    jest.requireActual<typeof import("elysia")>("elysia");
  return {
    requireAuth: new LocalElysia({ name: "require-auth-test" }),
  };
});

jest.mock("../../lib/user-setup", () => ({
  ensureUserCalendars: jest.fn(async (): Promise<any> => undefined),
}));

jest.mock("../../lib/ics-export", () => ({
  toIcsBuildEvent: jest.fn(),
  toSafeIcsFilename: jest.fn(() => "event.ics"),
}));

import { errorHandler } from "../../lib/errors";
import { ensureAuthenticatedUser } from "../../lib/auth-utils";
import { prisma } from "../../lib/prisma";
import { eventsRoutes } from "../../routes/events";
import { ALLOWED_CALENDAR_COLORS } from "../../lib/colors";

const mockEnsureAuthenticatedUser =
  ensureAuthenticatedUser as jest.MockedFunction<typeof ensureAuthenticatedUser>;
const mockPrisma = prisma as unknown as {
  calendarEvent: {
    findMany: jest.Mock<() => Promise<any>>;
    findFirst: jest.Mock<() => Promise<any>>;
    create: jest.Mock<() => Promise<any>>;
    update: jest.Mock<() => Promise<any>>;
    delete: jest.Mock<() => Promise<any>>;
  };
  calendar: {
    findFirst: jest.Mock<() => Promise<any>>;
    findMany: jest.Mock<() => Promise<any>>;
  };
  eventCategory: {
    findFirst: jest.Mock<() => Promise<any>>;
    findMany: jest.Mock<() => Promise<any>>;
  };
  eventNotification: {
    create: jest.Mock<() => Promise<any>>;
    deleteMany: jest.Mock<() => Promise<any>>;
  };
  userSettings: {
    findUnique: jest.Mock<() => Promise<any>>;
  };
};

function createApp() {
  return new Elysia({ normalize: false })
    .use(errorHandler)
    .use(eventsRoutes);
}

async function readText(response: Response) {
  return response.text();
}

const validEventBody = {
  title: "Test Event",
  start: "2026-05-01T10:00:00.000Z",
  end: "2026-05-01T11:00:00.000Z",
  calendarId: "cal-1",
};

const ownedCalendar = {
  id: "cal-1",
  name: "Work",
  color: "blue",
  kind: "owned",
  isSyncOnly: false,
  icsShareEnabled: false,
  userId: "user-1",
};

describe("eventsRoutes – color validation", () => {
  beforeEach(() => {
    mockEnsureAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockPrisma.calendar.findFirst.mockResolvedValue(ownedCalendar);
  });

  describe("POST /events – create", () => {
    it.each(ALLOWED_CALENDAR_COLORS)(
      "accepts named color '%s'",
      async (color) => {
        const created = {
          id: "event-1",
          ...validEventBody,
          color,
          userId: "user-1",
          category: null,
          calendar: ownedCalendar,
        };
        mockPrisma.calendarEvent.create.mockResolvedValue(created);

        const response = await createApp().handle(
          new Request("http://localhost/events/", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...validEventBody, color }),
          }),
        );

        expect(response.status).toBe(200);
        expect(mockPrisma.calendarEvent.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ color }),
          }),
        );
      },
    );

    it("accepts valid hex color", async () => {
      const created = {
        id: "event-1",
        ...validEventBody,
        color: "#A1B2C3",
        userId: "user-1",
        category: null,
        calendar: ownedCalendar,
      };
      mockPrisma.calendarEvent.create.mockResolvedValue(created);

      const response = await createApp().handle(
        new Request("http://localhost/events/", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...validEventBody, color: "#A1B2C3" }),
        }),
      );

      expect(response.status).toBe(200);
      expect(mockPrisma.calendarEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ color: "#A1B2C3" }),
        }),
      );
    });

    it("falls back to resolve the authenticated user from the request context", async () => {
      mockEnsureAuthenticatedUser.mockClear();
      mockPrisma.calendarEvent.create.mockResolvedValue({
        id: "event-1",
        ...validEventBody,
        color: null,
        userId: "user-1",
        category: null,
        calendar: ownedCalendar,
      });

      const response = await createApp().handle(
        new Request("http://localhost/events/", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(validEventBody),
        }),
      );

      expect(response.status).toBe(200);
      expect(mockEnsureAuthenticatedUser).toHaveBeenCalledWith(
        undefined,
        expect.any(Request),
      );
    });

    it("accepts event without color (null)", async () => {
      const created = {
        id: "event-1",
        ...validEventBody,
        color: null,
        userId: "user-1",
        category: null,
        calendar: ownedCalendar,
      };
      mockPrisma.calendarEvent.create.mockResolvedValue(created);

      const response = await createApp().handle(
        new Request("http://localhost/events/", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(validEventBody),
        }),
      );

      const text = await readText(response);
      expect(response.status).toBe(200);
      expect(mockPrisma.calendarEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ color: null }),
        }),
      );
    });

    it("persists encrypted shadow fields when provided on create", async () => {
      mockPrisma.calendarEvent.create.mockResolvedValue({
        id: "event-enc-1",
        ...validEventBody,
        title: "",
        color: null,
        encryptedContent: "ciphertext",
        blindIndexTokens: JSON.stringify(["idx-1", "idx-2"]),
        encryptionState: "encrypted",
        encryptionKeyVersion: 2,
        userId: "user-1",
        category: null,
        calendar: ownedCalendar,
      });

      const response = await createApp().handle(
        new Request("http://localhost/events/", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...validEventBody,
            encryptedContent: "ciphertext",
            blindIndexTokens: ["idx-1", "idx-2"],
            encryptionKeyVersion: 2,
          }),
        }),
      );

      expect(response.status).toBe(200);
      expect(mockPrisma.calendarEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: "",
            description: null,
            location: null,
            encryptedContent: "ciphertext",
            blindIndexTokens: JSON.stringify(["idx-1", "idx-2"]),
            encryptionState: "encrypted",
            encryptionKeyVersion: 2,
          }),
        }),
      );
    });

    it("rejects client-controlled encryptionState on create", async () => {
      const response = await createApp().handle(
        new Request("http://localhost/events/", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...validEventBody,
            encryptionState: "encrypted",
          }),
        }),
      );

      expect(response.status).toBe(422);
      await expect(readText(response)).resolves.toContain(
        "Property 'encryptionState' should not be provided",
      );
      expect(mockPrisma.calendarEvent.create).not.toHaveBeenCalled();
    });

    it("keeps plaintext shadow fields when a reminder requires readable content", async () => {
      mockPrisma.calendarEvent.create.mockResolvedValue({
        id: "event-reminder-1",
        ...validEventBody,
        color: null,
        encryptedContent: "ciphertext",
        blindIndexTokens: JSON.stringify(["idx-1"]),
        encryptionState: "shadow_write",
        encryptionKeyVersion: 1,
        reminder: 30,
        userId: "user-1",
        category: null,
        calendar: ownedCalendar,
      });

      const response = await createApp().handle(
        new Request("http://localhost/events/", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...validEventBody,
            reminder: 30,
            encryptedContent: "ciphertext",
            blindIndexTokens: ["idx-1"],
          }),
        }),
      );

      expect(response.status).toBe(200);
      expect(mockPrisma.calendarEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: "Test Event",
            encryptionState: "shadow_write",
            reminder: 30,
          }),
        }),
      );
    });

    it("rejects full mode event creation without encrypted content", async () => {
      mockPrisma.userSettings.findUnique.mockResolvedValueOnce({
        timezone: "UTC",
        eventEncryptionMode: "full",
        emailNotifications: true,
      });

      const response = await createApp().handle(
        new Request("http://localhost/events/", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(validEventBody),
        }),
      );

      expect(response.status).toBe(500);
      await expect(readText(response)).resolves.toBe(
        "Full event encryption requires an active encryption session.",
      );
    });

    it.each(["chartreuse", "BLUE", "rgb(0,0,0)", "#GGGGGG", "#12345"])(
      "rejects invalid color '%s'",
      async (color) => {
        const response = await createApp().handle(
          new Request("http://localhost/events/", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...validEventBody, color }),
          }),
        );

        const text = await readText(response);
        expect(text).toContain("Color must be one of:");
        expect(mockPrisma.calendarEvent.create).not.toHaveBeenCalled();
      },
    );

    it("includes all allowed colors in error message", async () => {
      const response = await createApp().handle(
        new Request("http://localhost/events/", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...validEventBody, color: "invalid" }),
        }),
      );

      const text = await readText(response);
      for (const color of ALLOWED_CALENDAR_COLORS) {
        expect(text).toContain(color);
      }
    });
  });

  describe("PUT /events/:id – update", () => {
    const existingEvent = {
      id: "event-1",
      title: "Test Event",
      description: "Discuss roadmap",
      location: "Room 7",
      start: new Date("2026-05-01T10:00:00.000Z"),
      end: new Date("2026-05-01T11:00:00.000Z"),
      color: "blue",
      calendarId: "cal-1",
      userId: "user-1",
      isSynced: false,
      encryptedContent: "ciphertext",
      encryptionState: "shadow_write",
      reminder: null,
      recurrence: null,
      parentEventId: null,
      updatedAt: new Date("2026-04-01T00:00:00.000Z"),
      calendar: ownedCalendar,
      category: null,
    };

    it("accepts valid named color on update", async () => {
      mockPrisma.calendarEvent.findFirst.mockResolvedValue(existingEvent);
      mockPrisma.calendarEvent.update.mockResolvedValue({
        ...existingEvent,
        color: "rose",
      });

      const response = await createApp().handle(
        new Request("http://localhost/events/event-1", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            color: "rose",
          }),
        }),
      );

      expect(response.status).toBe(200);
    });

    it("persists encrypted shadow fields on update", async () => {
      mockPrisma.calendarEvent.findFirst.mockResolvedValue(existingEvent);
      mockPrisma.calendarEvent.update.mockResolvedValue({
        ...existingEvent,
        encryptedContent: "ciphertext",
        blindIndexTokens: JSON.stringify(["idx-1"]),
        encryptionState: "shadow_write",
        encryptionKeyVersion: 2,
      });

      const response = await createApp().handle(
        new Request("http://localhost/events/event-1", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            encryptedContent: "ciphertext",
            blindIndexTokens: ["idx-1"],
            encryptionKeyVersion: 2,
          }),
        }),
      );

      expect(response.status).toBe(200);
      expect(mockPrisma.calendarEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: "",
            description: null,
            location: null,
            encryptedContent: "ciphertext",
            blindIndexTokens: JSON.stringify(["idx-1"]),
            encryptionState: "encrypted",
            encryptionKeyVersion: 2,
          }),
        }),
      );
    });

    it("rejects client-controlled encryptionState on update", async () => {
      mockPrisma.calendarEvent.findFirst.mockResolvedValue(existingEvent);

      const response = await createApp().handle(
        new Request("http://localhost/events/event-1", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            encryptionState: "plaintext",
          }),
        }),
      );

      expect(response.status).toBe(422);
      await expect(readText(response)).resolves.toContain(
        "Property 'encryptionState' should not be provided",
      );
      expect(mockPrisma.calendarEvent.update).not.toHaveBeenCalled();
    });

    it("accepts valid hex color on update", async () => {
      mockEnsureAuthenticatedUser.mockClear();
      mockPrisma.calendarEvent.findFirst.mockResolvedValue(existingEvent);
      mockPrisma.calendarEvent.update.mockResolvedValue({
        ...existingEvent,
        color: "#FF5733",
      });

      const response = await createApp().handle(
        new Request("http://localhost/events/event-1", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            color: "#FF5733",
          }),
        }),
      );

      expect(response.status).toBe(200);
      expect(mockEnsureAuthenticatedUser).toHaveBeenCalledWith(
        undefined,
        expect.any(Request),
      );
    });

    it("rejects invalid color on update", async () => {
      mockPrisma.calendarEvent.findFirst.mockResolvedValue(existingEvent);

      const response = await createApp().handle(
        new Request("http://localhost/events/event-1", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            color: "chartreuse",
          }),
        }),
      );

      const text = await readText(response);
      expect(text).toContain("Color must be one of:");
    });
  });
});
