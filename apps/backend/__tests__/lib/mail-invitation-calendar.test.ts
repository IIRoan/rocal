import { describe, expect, it, jest } from "@jest/globals";
import { resolveAcceptedInvitationTargetCalendar } from "../../lib/mail-invitation-calendar";

function createPrismaMock() {
  return {
    userSettings: {
      findUnique: jest.fn(async () => ({ defaultCalendarId: "calendar-default" })),
    },
    calendar: {
      findFirst: jest.fn(async ({ where }: { where: { id?: string } }) => {
        if (where.id === "calendar-default") {
          return {
            id: "calendar-default",
            name: "Personal",
            color: "#10b981",
            kind: "owned",
            isVisible: true,
            isDefault: true,
            isSyncOnly: false,
            forceFullEncryption: false,
            stalwartAccountId: null,
            stalwartCalendarId: null,
          };
        }
        return null;
      }),
      count: jest.fn(async () => 1),
      create: jest.fn(),
    },
  };
}

describe("resolveAcceptedInvitationTargetCalendar", () => {
  it("uses the user's default owned writable calendar", async () => {
    const prisma = createPrismaMock();

    const calendar = await resolveAcceptedInvitationTargetCalendar(
      prisma as never,
      "user-1",
    );

    expect(calendar?.id).toBe("calendar-default");
    expect(prisma.calendar.create).not.toHaveBeenCalled();
  });

  it("prefers an explicitly requested owned calendar", async () => {
    const prisma = createPrismaMock();
    prisma.calendar.findFirst.mockImplementation(
      async ({ where }: { where: { id?: string } }) => {
        if (where.id === "calendar-work") {
          return {
            id: "calendar-work",
            name: "Work",
            color: "#3b82f6",
            kind: "owned",
            isVisible: true,
            isDefault: false,
            isSyncOnly: false,
            forceFullEncryption: false,
            stalwartAccountId: null,
            stalwartCalendarId: null,
          };
        }
        return null;
      },
    );

    const calendar = await resolveAcceptedInvitationTargetCalendar(
      prisma as never,
      "user-1",
      "calendar-work",
    );

    expect(calendar?.id).toBe("calendar-work");
  });
});
