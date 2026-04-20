import { describe, expect, it, jest } from "@jest/globals";
import { Elysia } from "elysia";

jest.mock("../../lib/prisma", () => ({
  prisma: {
    userSettings: {
      findUnique: jest.fn(async (): Promise<any> => null),
      create: jest.fn(async (): Promise<any> => null),
      upsert: jest.fn(async (): Promise<any> => null),
      deleteMany: jest.fn(async (): Promise<any> => ({ count: 0 })),
    },
    calendar: {
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

import { errorHandler } from "../../lib/errors";
import { ensureAuthenticatedUser } from "../../lib/auth-utils";
import { prisma } from "../../lib/prisma";
import { settingsRoutes } from "../../routes/settings";

const mockEnsureAuthenticatedUser =
  ensureAuthenticatedUser as jest.MockedFunction<typeof ensureAuthenticatedUser>;
const mockPrisma = prisma as unknown as {
  userSettings: {
    findUnique: jest.Mock<() => Promise<any>>;
    create: jest.Mock<() => Promise<any>>;
    upsert: jest.Mock<() => Promise<any>>;
    deleteMany: jest.Mock<() => Promise<any>>;
  };
  calendar: {
    findFirst: jest.Mock<() => Promise<any>>;
  };
};

function createApp() {
  return new Elysia({ normalize: false })
    .use(errorHandler)
    .use(settingsRoutes);
}

async function readJson(response: Response) {
  return response.json();
}

async function readText(response: Response) {
  return response.text();
}

describe("settingsRoutes", () => {
  it("returns existing user settings", async () => {
    const settings = {
      id: "settings-1",
      userId: "user-1",
      timezone: "UTC",
    };
    mockEnsureAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockPrisma.userSettings.findUnique.mockResolvedValue(settings);

    const response = await createApp().handle(
      new Request("http://localhost/settings/"),
    );

    expect(response.status).toBe(200);
    await expect(readJson(response)).resolves.toEqual(settings);
  });

  it("creates default settings when none exist yet", async () => {
    const settings = {
      id: "settings-1",
      userId: "user-1",
      timezone: "UTC",
    };
    mockEnsureAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockPrisma.userSettings.findUnique.mockResolvedValue(null);
    mockPrisma.userSettings.create.mockResolvedValue(settings);

    const response = await createApp().handle(
      new Request("http://localhost/settings/"),
    );

    expect(mockPrisma.userSettings.create).toHaveBeenCalledWith({
      data: { userId: "user-1" },
    });
    await expect(readJson(response)).resolves.toEqual(settings);
  });

  it("rejects invalid timezones during update", async () => {
    mockEnsureAuthenticatedUser.mockResolvedValue({ id: "user-1" });

    const response = await createApp().handle(
      new Request("http://localhost/settings/", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ timezone: "Mars/Olympus" }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(readText(response)).resolves.toBe("Invalid timezone identifier");
  });

  it("rejects inverted working hours", async () => {
    mockEnsureAuthenticatedUser.mockResolvedValue({ id: "user-1" });

    const response = await createApp().handle(
      new Request("http://localhost/settings/", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workingHoursStart: 600,
          workingHoursEnd: 540,
        }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(readText(response)).resolves.toBe(
      "Working hours start must be before working hours end",
    );
  });

  it("rejects malformed working days JSON", async () => {
    mockEnsureAuthenticatedUser.mockResolvedValue({ id: "user-1" });

    const response = await createApp().handle(
      new Request("http://localhost/settings/", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workingDays: "not-json",
        }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(readText(response)).resolves.toBe(
      "Invalid working days format - must be valid JSON array",
    );
  });

  it("rejects working days outside the allowed weekday range", async () => {
    mockEnsureAuthenticatedUser.mockResolvedValue({ id: "user-1" });

    const response = await createApp().handle(
      new Request("http://localhost/settings/", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workingDays: "[1,7]",
        }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(readText(response)).resolves.toBe(
      "Working days must be a JSON array of numbers 0-6",
    );
  });

  it("rejects a default calendar that does not belong to the user", async () => {
    mockEnsureAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockPrisma.calendar.findFirst.mockResolvedValue(null);

    const response = await createApp().handle(
      new Request("http://localhost/settings/", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          defaultCalendarId: "calendar-1",
        }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(readText(response)).resolves.toBe(
      "Invalid default calendar or calendar does not belong to user",
    );
  });

  it("rejects a non-owned default calendar", async () => {
    mockEnsureAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockPrisma.calendar.findFirst.mockResolvedValue({
      id: "calendar-1",
      kind: "subscribed",
    });

    const response = await createApp().handle(
      new Request("http://localhost/settings/", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          defaultCalendarId: "calendar-1",
        }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(readText(response)).resolves.toBe(
      "The default calendar must be one of your editable calendars.",
    );
  });

  it("upserts valid settings updates", async () => {
    const savedSettings = {
      id: "settings-1",
      userId: "user-1",
      timezone: "UTC",
      defaultCalendarId: "calendar-1",
    };
    mockEnsureAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockPrisma.calendar.findFirst.mockResolvedValue({
      id: "calendar-1",
      kind: "owned",
    });
    mockPrisma.userSettings.upsert.mockResolvedValue(savedSettings);

    const response = await createApp().handle(
      new Request("http://localhost/settings/", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          timezone: "UTC",
          defaultCalendarId: "calendar-1",
          workingDays: "[1,2,3,4,5]",
        }),
      }),
    );

    expect(mockPrisma.userSettings.upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      update: expect.objectContaining({
        timezone: "UTC",
        defaultCalendarId: "calendar-1",
        workingDays: "[1,2,3,4,5]",
        updatedAt: expect.any(Date),
      }),
      create: {
        userId: "user-1",
        timezone: "UTC",
        defaultCalendarId: "calendar-1",
        workingDays: "[1,2,3,4,5]",
      },
    });
    await expect(readJson(response)).resolves.toEqual(savedSettings);
  });

  it("deletes a user's settings on reset", async () => {
    mockEnsureAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mockPrisma.userSettings.deleteMany.mockResolvedValue({ count: 1 });

    const response = await createApp().handle(
      new Request("http://localhost/settings/", {
        method: "DELETE",
      }),
    );

    expect(mockPrisma.userSettings.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
    await expect(readJson(response)).resolves.toEqual({
      success: true,
      message: "User settings reset to defaults",
    });
  });
});
