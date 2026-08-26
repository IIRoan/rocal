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
      findUnique: jest.fn(
        async (): Promise<any> => ({
          timezone: "UTC",
          eventEncryptionMode: "hybrid",
          emailNotifications: true,
        }),
      ),
    },
    user: {
      findUnique: jest.fn(
        async (): Promise<any> => ({
          id: "user-1",
          email: "owner@example.com",
          name: "Owner",
        }),
      ),
      findMany: jest.fn(async (): Promise<any> => []),
    },
    eventParticipant: {
      findMany: jest.fn(async (): Promise<any> => []),
      upsert: jest.fn(async (): Promise<any> => null),
      deleteMany: jest.fn(async (): Promise<any> => ({ count: 0 })),
    },
    mailDirectoryEntry: {
      findUnique: jest.fn(async (): Promise<any> => null),
      findMany: jest.fn(async (): Promise<any> => []),
    },
    $executeRaw: jest.fn(async (): Promise<any> => 1),
  },
}));

jest.mock("../../lib/email-client", () => ({
  mailer: {
    emails: {
      send: jest.fn(async () => ({ data: { id: "email-1" } })),
    },
  },
  authEmailFrom: "Solace <test@example.com>",
}));

jest.mock("../../lib/auth", () => ({
  auth: { api: { getSession: jest.fn() } },
}));

jest.mock("../../lib/auth-guard", () => {
  const { createMockRequireAuth } =
    jest.requireActual<typeof import("../helpers/mock-require-auth")>(
      "../helpers/mock-require-auth",
    );
  return {
    requireAuth: createMockRequireAuth(),
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
import { prisma } from "../../lib/prisma";
import { eventsRoutes } from "../../routes/events";
import { ALLOWED_CALENDAR_COLORS } from "../../lib/colors";
import { expectValidationError } from "../helpers/validation-assertions";

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
  user: {
    findUnique: jest.Mock<() => Promise<any>>;
    findMany: jest.Mock<() => Promise<any>>;
  };
  eventParticipant: {
    findMany: jest.Mock<() => Promise<any>>;
    upsert: jest.Mock<() => Promise<any>>;
    deleteMany: jest.Mock<() => Promise<any>>;
  };
};

function createApp() {
  return new Elysia({ normalize: false }).use(errorHandler).use(eventsRoutes);
}

async function readText(response: Response) {
  return response.text();
}

const validEventBody = {
  title: "Test Event",
  start: "2026-05-01T10:00:00.000Z",
  end: "2026-05-01T11:00:00.000Z",
  calendarId: "cal-1",
  encryptedContent: "ciphertext",
  blindIndexTokens: ["idx-1"],
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
  beforeEach(() => {    mockPrisma.calendar.findFirst.mockResolvedValue(ownedCalendar);
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

    it("authenticates requests through requireAuth", async () => {
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

    it("accepts participants and syncs them through the event API", async () => {
      mockPrisma.eventParticipant.upsert.mockClear();
      mockPrisma.calendarEvent.create.mockResolvedValue({
        id: "event-participants-1",
        ...validEventBody,
        color: null,
        reminder: null,
        recurrence: null,
        encryptedContent: null,
        blindIndexTokens: null,
        encryptionState: "plaintext",
        encryptionKeyVersion: 1,
        userId: "user-1",
        category: null,
        calendar: ownedCalendar,
        createdAt: new Date("2026-05-01T09:00:00.000Z"),
        updatedAt: new Date("2026-05-01T09:00:00.000Z"),
      });

      const response = await createApp().handle(
        new Request("http://localhost/events/", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...validEventBody,
            participants: [
              {
                email: "teammate@example.com",
                role: "attendee",
                status: "pending",
              },
            ],
          }),
        }),
      );

      expect(response.status).toBe(200);
      expect(mockPrisma.eventParticipant.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            eventId_email: {
              eventId: "event-participants-1",
              email: "teammate@example.com",
            },
          },
        }),
      );
    });

    it("rejects invalid participant email addresses", async () => {
      const response = await createApp().handle(
        new Request("http://localhost/events/", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...validEventBody,
            participants: [
              {
                email: "not-an-email",
                role: "attendee",
                status: "pending",
              },
            ],
          }),
        }),
      );

      expect(response.status).toBe(422);
      expect(mockPrisma.calendarEvent.create).not.toHaveBeenCalled();
    });

    it("persists encrypted shadow fields when provided on create", async () => {
      mockPrisma.calendarEvent.create.mockResolvedValue({
        id: "event-enc-1",
        ...validEventBody,
        title: "Test Event",
        description: null,
        location: null,
        color: null,
        encryptedContent: "ciphertext",
        blindIndexTokens: JSON.stringify(["idx-1", "idx-2"]),
        encryptionState: "shadow_write",
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
      await expectValidationError(response, "encryptionState");
      expect(mockPrisma.calendarEvent.create).not.toHaveBeenCalled();
    });

    it("stores encrypted events ciphertext-only even when reminders are enabled", async () => {
      mockPrisma.calendarEvent.create.mockResolvedValue({
        id: "event-reminder-1",
        ...validEventBody,
        color: null,
        encryptedContent: "ciphertext",
        blindIndexTokens: JSON.stringify(["idx-1"]),
        encryptionState: "encrypted",
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
          }),
        }),
      );

      expect(response.status).toBe(200);
      expect(mockPrisma.calendarEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: "",
            encryptionState: "encrypted",
            reminder: 30,
          }),
        }),
      );
    });

    it("rejects owned-calendar event creation without encrypted content", async () => {
      const { encryptedContent: _encryptedContent, blindIndexTokens: _blindIndexTokens, ...unencryptedBody } =
        validEventBody;

      const response = await createApp().handle(
        new Request("http://localhost/events/", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(unencryptedBody),
        }),
      );

      expect(response.status).toBe(500);
      await expect(readText(response)).resolves.toContain(
        "Event encryption requires an active encryption session.",
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
      encryptionState: "encrypted",
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
      await expectValidationError(response, "encryptionState");
      expect(mockPrisma.calendarEvent.update).not.toHaveBeenCalled();
    });

    it("accepts valid hex color on update", async () => {      mockPrisma.calendarEvent.findFirst.mockResolvedValue(existingEvent);
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
