import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import { Elysia } from "elysia";

jest.mock("../../lib/prisma", () => ({
  prisma: {
    calendar: {
      findMany: jest.fn(async (): Promise<any> => []),
      findFirst: jest.fn(async (): Promise<any> => null),
      create: jest.fn(async (): Promise<any> => null),
      update: jest.fn(async (): Promise<any> => null),
      updateMany: jest.fn(async (): Promise<any> => ({ count: 0 })),
      delete: jest.fn(async (): Promise<any> => null),
      count: jest.fn(async (): Promise<any> => 0),
    },
    calendarEvent: {
      deleteMany: jest.fn(async (): Promise<any> => ({ count: 0 })),
    },
    calendarSubscription: {
      findFirst: jest.fn(async (): Promise<any> => null),
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

import { errorHandler } from "../../lib/errors";
import { ensureAuthenticatedUser } from "../../lib/auth-utils";
import { prisma } from "../../lib/prisma";
import { calendarsRoutes } from "../../routes/calendars";
import { ALLOWED_CALENDAR_COLORS } from "../../lib/colors";

const mockEnsureAuthenticatedUser =
  ensureAuthenticatedUser as jest.MockedFunction<typeof ensureAuthenticatedUser>;
const mockPrisma = prisma as unknown as {
  calendar: {
    findMany: jest.Mock<() => Promise<any>>;
    findFirst: jest.Mock<() => Promise<any>>;
    create: jest.Mock<() => Promise<any>>;
    update: jest.Mock<() => Promise<any>>;
    updateMany: jest.Mock<() => Promise<any>>;
    delete: jest.Mock<() => Promise<any>>;
    count: jest.Mock<() => Promise<any>>;
  };
  calendarEvent: {
    deleteMany: jest.Mock<() => Promise<any>>;
  };
  calendarSubscription: {
    findFirst: jest.Mock<() => Promise<any>>;
  };
};

function createApp() {
  return new Elysia({ normalize: false })
    .use(errorHandler)
    .use(calendarsRoutes);
}

async function readJson(response: Response) {
  return response.json();
}

async function readText(response: Response) {
  return response.text();
}

describe("calendarsRoutes – color validation", () => {
  beforeEach(() => {
    mockEnsureAuthenticatedUser.mockResolvedValue({ id: "user-1" });
  });

  describe("POST /calendars – create", () => {
    it.each(ALLOWED_CALENDAR_COLORS)(
      "accepts named color '%s'",
      async (color) => {
        const created = {
          id: "cal-1",
          name: "Test",
          color,
          kind: "owned",
          isPublic: false,
          isVisible: true,
          isDefault: false,
          userId: "user-1",
        };
        mockPrisma.calendar.findFirst.mockResolvedValue(null);
        mockPrisma.calendar.create.mockResolvedValue(created);

        const response = await createApp().handle(
          new Request("http://localhost/calendars/", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "Test", color }),
          }),
        );

        expect(response.status).toBe(200);
        expect(mockPrisma.calendar.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ color }),
          }),
        );
      },
    );

    it("accepts a valid 6-digit hex color", async () => {
      const created = {
        id: "cal-1",
        name: "Test",
        color: "#FF5733",
        userId: "user-1",
      };
      mockPrisma.calendar.findFirst.mockResolvedValue(null);
      mockPrisma.calendar.create.mockResolvedValue(created);

      const response = await createApp().handle(
        new Request("http://localhost/calendars/", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Test", color: "#FF5733" }),
        }),
      );

      expect(response.status).toBe(200);
      expect(mockPrisma.calendar.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ color: "#FF5733" }),
        }),
      );
    });

    it("accepts a valid 3-digit hex color", async () => {
      const created = {
        id: "cal-1",
        name: "Test",
        color: "#FFF",
        userId: "user-1",
      };
      mockPrisma.calendar.findFirst.mockResolvedValue(null);
      mockPrisma.calendar.create.mockResolvedValue(created);

      const response = await createApp().handle(
        new Request("http://localhost/calendars/", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Test", color: "#FFF" }),
        }),
      );

      expect(response.status).toBe(200);
      expect(mockPrisma.calendar.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ color: "#FFF" }),
        }),
      );
    });

    it.each(["chartreuse", "navy", "BLUE", "rgb(0,0,0)", "#GGG", "#12345", ""])(
      "rejects invalid color '%s'",
      async (color) => {
        const response = await createApp().handle(
          new Request("http://localhost/calendars/", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "Test", color }),
          }),
        );

        const text = await readText(response);
        expect(text).toContain("Color must be one of:");
        expect(mockPrisma.calendar.create).not.toHaveBeenCalled();
      },
    );

    it("includes all allowed colors in the error message", async () => {
      const response = await createApp().handle(
        new Request("http://localhost/calendars/", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Test", color: "invalid" }),
        }),
      );

      const text = await readText(response);
      for (const color of ALLOWED_CALENDAR_COLORS) {
        expect(text).toContain(color);
      }
    });
  });

  describe("PUT /calendars/:id – update", () => {
    const existingCalendar = {
      id: "cal-1",
      name: "Work",
      color: "blue",
      kind: "owned",
      userId: "user-1",
    };

    it.each(ALLOWED_CALENDAR_COLORS)(
      "accepts named color '%s' on update",
      async (color) => {
        mockPrisma.calendar.findFirst.mockResolvedValue(existingCalendar);
        mockPrisma.calendar.update.mockResolvedValue({
          ...existingCalendar,
          color,
        });

        const response = await createApp().handle(
          new Request("http://localhost/calendars/cal-1", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ color }),
          }),
        );

        expect(response.status).toBe(200);
        expect(mockPrisma.calendar.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ color }),
          }),
        );
      },
    );

    it("accepts hex colors on update", async () => {
      mockPrisma.calendar.findFirst.mockResolvedValue(existingCalendar);
      mockPrisma.calendar.update.mockResolvedValue({
        ...existingCalendar,
        color: "#abc123",
      });

      const response = await createApp().handle(
        new Request("http://localhost/calendars/cal-1", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ color: "#abc123" }),
        }),
      );

      expect(response.status).toBe(200);
      expect(mockPrisma.calendar.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ color: "#abc123" }),
        }),
      );
    });

    it("rejects invalid colors on update", async () => {
      mockPrisma.calendar.findFirst.mockResolvedValue(existingCalendar);

      const response = await createApp().handle(
        new Request("http://localhost/calendars/cal-1", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ color: "chartreuse" }),
        }),
      );

      const text = await readText(response);
      expect(text).toContain("Color must be one of:");
      expect(mockPrisma.calendar.update).not.toHaveBeenCalled();
    });

    it("allows update without color field", async () => {
      mockPrisma.calendar.findFirst
        .mockResolvedValueOnce(existingCalendar) // ownership check
        .mockResolvedValueOnce(null); // duplicate name check
      mockPrisma.calendar.update.mockResolvedValue({
        ...existingCalendar,
        name: "Personal",
      });

      const response = await createApp().handle(
        new Request("http://localhost/calendars/cal-1", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Personal" }),
        }),
      );

      expect(response.status).toBe(200);
    });

    it("rejects updates to non-owned calendars (except visibility)", async () => {
      mockPrisma.calendar.findFirst.mockResolvedValue({
        ...existingCalendar,
        kind: "subscribed",
      });

      const response = await createApp().handle(
        new Request("http://localhost/calendars/cal-1", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ color: "rose" }),
        }),
      );

      const text = await readText(response);
      expect(text).toContain("Only owned calendars");
    });
  });
});
