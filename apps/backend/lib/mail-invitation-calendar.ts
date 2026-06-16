import type { Calendar, PrismaClient } from "../generated/prisma/index.js";

export type InvitationTargetCalendar = Pick<
  Calendar,
  | "id"
  | "name"
  | "color"
  | "kind"
  | "isVisible"
  | "isDefault"
  | "isSyncOnly"
  | "forceFullEncryption"
  | "stalwartAccountId"
  | "stalwartCalendarId"
>;

const invitationTargetCalendarSelect = {
  id: true,
  name: true,
  color: true,
  kind: true,
  isVisible: true,
  isDefault: true,
  isSyncOnly: true,
  forceFullEncryption: true,
  stalwartAccountId: true,
  stalwartCalendarId: true,
} as const;

const writableOwnedCalendarWhere = {
  kind: "owned",
  isSyncOnly: false,
  forceFullEncryption: false,
} as const;

export async function resolveAcceptedInvitationTargetCalendar(
  prisma: PrismaClient,
  userId: string,
  calendarId?: string | null,
): Promise<InvitationTargetCalendar | null> {
  if (calendarId) {
    const requestedCalendar = await prisma.calendar.findFirst({
      where: {
        id: calendarId,
        userId,
        ...writableOwnedCalendarWhere,
      },
      select: invitationTargetCalendarSelect,
    });

    if (requestedCalendar) {
      return requestedCalendar;
    }
  }

  const userSettings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { defaultCalendarId: true },
  });

  if (userSettings?.defaultCalendarId) {
    const defaultCalendar = await prisma.calendar.findFirst({
      where: {
        id: userSettings.defaultCalendarId,
        userId,
        ...writableOwnedCalendarWhere,
      },
      select: invitationTargetCalendarSelect,
    });

    if (defaultCalendar) {
      return defaultCalendar;
    }
  }

  const existingCalendar = await prisma.calendar.findFirst({
    where: {
      userId,
      ...writableOwnedCalendarWhere,
    },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: invitationTargetCalendarSelect,
  });

  if (existingCalendar) {
    return existingCalendar;
  }

  const calendarCount = await prisma.calendar.count({
    where: { userId },
  });

  if (calendarCount > 0) {
    return null;
  }

  return prisma.calendar.create({
    data: {
      name: "Personal",
      color: "#10b981",
      kind: "owned",
      isPublic: false,
      isVisible: true,
      isDefault: true,
      forceFullEncryption: false,
      userId,
    },
    select: invitationTargetCalendarSelect,
  });
}
