import { describe, expect, it, jest } from "@jest/globals";

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

jest.mock("../../lib/prisma", () => ({
  prisma: {
    calendar: {
      findMany: jest.fn(async (): Promise<any> => []),
      createMany: jest.fn(async (): Promise<any> => ({ count: 0 })),
    },
  },
}));

import { prisma } from "../../lib/prisma";
import { ensureUserCalendars } from "../../lib/user-setup";

const mockPrisma = prisma as unknown as {
  calendar: {
    findMany: jest.Mock<() => Promise<any>>;
    createMany: jest.Mock<() => Promise<any>>;
  };
};

describe("ensureUserCalendars", () => {
  it("creates the default calendars when a user has none", async () => {
    mockPrisma.calendar.findMany.mockResolvedValue([]);
    mockPrisma.calendar.createMany.mockResolvedValue({ count: 3 });

    await ensureUserCalendars("user-1");

    expect(mockPrisma.calendar.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
    expect(mockPrisma.calendar.createMany).toHaveBeenCalledWith({
      data: [
        {
          name: "Personal",
          color: "#10b981",
          kind: "owned",
          isPublic: false,
          isVisible: true,
          isDefault: true,
          userId: "user-1",
        },
        {
          name: "Work",
          color: "#3b82f6",
          kind: "owned",
          isPublic: false,
          isVisible: true,
          isDefault: false,
          userId: "user-1",
        },
        {
          name: "Family",
          color: "#f43f5e",
          kind: "owned",
          isPublic: false,
          isVisible: true,
          isDefault: false,
          userId: "user-1",
        },
      ],
    });
  });

  it("does not create calendars when the user already has some", async () => {
    mockPrisma.calendar.findMany.mockResolvedValue([{ id: "calendar-1" }]);

    await ensureUserCalendars("user-1");

    expect(mockPrisma.calendar.createMany).not.toHaveBeenCalled();
  });

  it("logs and swallows setup failures", async () => {
    const error = new Error("db offline");
    mockPrisma.calendar.findMany.mockRejectedValue(error);

    await expect(ensureUserCalendars("user-1")).resolves.toBeUndefined();
  });
});
