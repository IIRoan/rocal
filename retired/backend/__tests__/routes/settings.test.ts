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
      findMany: jest.fn(async (): Promise<any> => []),
      updateMany: jest.fn(async (): Promise<any> => ({ count: 0 })),
    },
    calendarEvent: {
      updateMany: jest.fn(async (): Promise<any> => ({ count: 0 })),
    },
    $transaction: jest.fn(async (callback: (tx: any) => Promise<any>) =>
      callback(
        (jest.requireMock("../../lib/prisma") as { prisma: any }).prisma,
      ),
    ),
  },
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

import { errorHandler } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { settingsRoutes } from "../../routes/settings";

const mockPrisma = prisma as unknown as {
  userSettings: {
    findUnique: jest.Mock<() => Promise<any>>;
    create: jest.Mock<() => Promise<any>>;
    upsert: jest.Mock<() => Promise<any>>;
    deleteMany: jest.Mock<() => Promise<any>>;
  };
  calendar: {
    findFirst: jest.Mock<() => Promise<any>>;
    findMany: jest.Mock<() => Promise<any>>;
    updateMany: jest.Mock<() => Promise<any>>;
  };
  calendarEvent: {
    updateMany: jest.Mock<() => Promise<any>>;
  };
  $transaction: jest.Mock;
};

function createApp() {
  return new Elysia({ normalize: false }).use(errorHandler).use(settingsRoutes);
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
    };    mockPrisma.userSettings.findUnique.mockResolvedValue(settings);

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
    };    mockPrisma.userSettings.findUnique.mockResolvedValue(null);
    mockPrisma.userSettings.create.mockResolvedValue(settings);

    const response = await createApp().handle(
      new Request("http://localhost/settings/"),
    );

    expect(mockPrisma.userSettings.create).toHaveBeenCalledWith({
      data: { userId: "user-1" },
    });
    await expect(readJson(response)).resolves.toEqual(settings);
  });

  it("rejects invalid timezones during update", async () => {    const response = await createApp().handle(
      new Request("http://localhost/settings/", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ timezone: "Mars/Olympus" }),
      }),
    );

    expect(response.status).toBe(422);
    await expect(readText(response)).resolves.toContain(
      "Invalid timezone identifier",
    );
  });

  it("rejects inverted working hours", async () => {    const response = await createApp().handle(
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
    await expect(readText(response)).resolves.toContain(
      "Working hours start must be before working hours end",
    );
  });

  it("rejects malformed working days JSON", async () => {    const response = await createApp().handle(
      new Request("http://localhost/settings/", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workingDays: "not-json",
        }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(readText(response)).resolves.toContain(
      "Invalid working days format - must be valid JSON array",
    );
  });

  it("rejects working days outside the allowed weekday range", async () => {    const response = await createApp().handle(
      new Request("http://localhost/settings/", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workingDays: "[1,7]",
        }),
      }),
    );

    expect(response.status).toBe(500);
    await expect(readText(response)).resolves.toContain(
      "Working days must be a JSON array of numbers 0-6",
    );
  });

  it("rejects a default calendar that does not belong to the user", async () => {    mockPrisma.calendar.findFirst.mockResolvedValue(null);

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
    await expect(readText(response)).resolves.toContain(
      "Invalid default calendar or calendar does not belong to user",
    );
  });

  it("rejects a non-owned default calendar", async () => {    mockPrisma.calendar.findFirst.mockResolvedValue({
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
    await expect(readText(response)).resolves.toContain(
      "The default calendar must be one of your editable calendars.",
    );
  });

  it("upserts valid settings updates", async () => {
    const savedSettings = {
      id: "settings-1",
      userId: "user-1",
      timezone: "UTC",
      defaultCalendarId: "calendar-1",
    };    mockPrisma.calendar.findFirst.mockResolvedValue({
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

  it("disables calendar sharing when full event encryption is enabled", async () => {
    const savedSettings = {
      id: "settings-1",
      userId: "user-1",
      timezone: "UTC",
      eventEncryptionMode: "full",
    };    mockPrisma.calendar.findMany.mockResolvedValue([
      { id: "calendar-1" },
      { id: "calendar-2" },
    ]);
    mockPrisma.userSettings.upsert.mockResolvedValue(savedSettings);

    const response = await createApp().handle(
      new Request("http://localhost/settings/", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          eventEncryptionMode: "full",
        }),
      }),
    );

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockPrisma.calendar.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", icsShareEnabled: true },
      data: {
        icsShareEnabled: false,
        icsShareToken: null,
        updatedAt: expect.any(Date),
      },
    });
    expect(mockPrisma.calendarEvent.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        calendarId: { in: ["calendar-1", "calendar-2"] },
        encryptedContent: { not: null },
        encryptionState: { not: "encrypted" },
      },
      data: {
        title: "",
        description: null,
        location: null,
        encryptionState: "encrypted",
        updatedAt: expect.any(Date),
      },
    });
    await expect(readJson(response)).resolves.toEqual(savedSettings);
  });

  it("deletes a user's settings on reset", async () => {    mockPrisma.userSettings.deleteMany.mockResolvedValue({ count: 1 });

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
