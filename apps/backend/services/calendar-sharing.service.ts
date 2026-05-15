import type { PrismaClient } from "../generated/prisma/client.js";
import type {
  ICalendarSharingService,
  ShareLinkInput,
  CreateShareLinkInput,
} from "../contracts/calendar-sharing.contract";
import {
  type CalendarShareLinkResponse,
  type DisableCalendarShareLinkResponse,
  buildIcsCalendar,
} from "@workspace/calendar-ics";
import { NotFoundError, ValidationError } from "../lib/errors";
import { createLogger } from "@workspace/logger";
import { toIcsBuildEvent } from "../lib/ics-export";

const logger = createLogger("backend:calendar-sharing-service");
import {
  backfillEncryptedEventsToCiphertextOnly,
  normalizeEventEncryptionMode,
} from "../lib/event-encryption";

const SHARE_TOKEN_LENGTH = 40;
const SHARE_TOKEN_ALPHABET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function generateShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SHARE_TOKEN_LENGTH));
  return Array.from(bytes)
    .map((value) => SHARE_TOKEN_ALPHABET[value % SHARE_TOKEN_ALPHABET.length])
    .join("");
}

export class CalendarSharingService implements ICalendarSharingService {
  constructor(private readonly prisma: PrismaClient) {}

  private async createUniqueShareToken(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const token = generateShareToken();
      const existing = await this.prisma.calendar.findFirst({
        where: { icsShareToken: token },
        select: { id: true },
      });

      if (!existing) return token;
    }

    throw new Error("Unable to generate a unique share token");
  }

  private serializeShareLink(
    calendar: {
      id: string;
      name: string;
      icsShareEnabled: boolean;
      icsShareToken: string | null;
    },
    baseUrl: string,
  ): CalendarShareLinkResponse {
    const enabled = calendar.icsShareEnabled && !!calendar.icsShareToken;
    return {
      calendarId: calendar.id,
      calendarName: calendar.name,
      enabled,
      shareUrl:
        enabled && calendar.icsShareToken
          ? `${baseUrl}/api/calendars/shared/${encodeURIComponent(calendar.icsShareToken)}`
          : null,
    };
  }

  async getShareLink(
    input: ShareLinkInput,
  ): Promise<CalendarShareLinkResponse> {
    const { userId, calendarId, baseUrl } = input;

    const calendar = await this.prisma.calendar.findFirst({
      where: { id: calendarId, userId },
      select: {
        id: true,
        name: true,
        icsShareEnabled: true,
        icsShareToken: true,
        isSyncOnly: true,
      },
    });

    if (!calendar) {
      throw new ValidationError("Calendar not found or access denied");
    }

    if (calendar.isSyncOnly) {
      throw new ValidationError(
        "Cannot share a synced calendar. This calendar is read-only and synced from an external subscription.",
      );
    }

    return this.serializeShareLink(calendar, baseUrl);
  }

  async createShareLink(
    input: CreateShareLinkInput,
  ): Promise<CalendarShareLinkResponse> {
    const { userId, calendarId, baseUrl, regenerate = false } = input;

    const userSettings = await this.prisma.userSettings.findUnique({
      where: { userId },
      select: { eventEncryptionMode: true },
    });

    if (userSettings?.eventEncryptionMode === "full") {
      throw new ValidationError(
        "Calendar sharing is unavailable while full event encryption is enabled.",
      );
    }

    const calendar = await this.prisma.calendar.findFirst({
      where: { id: calendarId, userId },
      select: {
        id: true,
        name: true,
        icsShareToken: true,
        isSyncOnly: true,
      },
    });

    if (!calendar) {
      throw new ValidationError("Calendar not found or access denied");
    }

    if (calendar.isSyncOnly) {
      throw new ValidationError(
        "Cannot share a synced calendar. This calendar is read-only and synced from an external subscription.",
      );
    }

    const encryptedEventCount = await this.prisma.calendarEvent.count({
      where: {
        calendarId: calendar.id,
        userId,
        encryptionState: "encrypted",
      },
    });

    if (encryptedEventCount > 0) {
      throw new ValidationError(
        "This calendar contains fully encrypted events. Reopen and save those events before enabling sharing.",
      );
    }

    let nextToken = calendar.icsShareToken;
    if (!nextToken || regenerate) {
      nextToken = await this.createUniqueShareToken();
    }

    const updatedCalendar = await this.prisma.calendar.update({
      where: { id: calendar.id },
      data: { icsShareEnabled: true, icsShareToken: nextToken },
      select: {
        id: true,
        name: true,
        icsShareEnabled: true,
        icsShareToken: true,
      },
    });

    return this.serializeShareLink(updatedCalendar, baseUrl);
  }

  async disableShareLink(
    input: ShareLinkInput,
  ): Promise<DisableCalendarShareLinkResponse> {
    const { userId, calendarId } = input;

    const [calendar, userSettings] = await Promise.all([
      this.prisma.calendar.findFirst({
        where: { id: calendarId, userId },
        select: {
          id: true,
          forceFullEncryption: true,
          isSyncOnly: true,
        },
      }),
      this.prisma.userSettings.findUnique({
        where: { userId },
        select: { eventEncryptionMode: true },
      }),
    ]);

    if (!calendar) {
      throw new ValidationError("Calendar not found or access denied");
    }

    if (calendar.isSyncOnly) {
      throw new ValidationError("Cannot modify sharing for a synced calendar.");
    }

    const now = new Date();
    await this.prisma.calendar.update({
      where: { id: calendar.id },
      data: { icsShareEnabled: false, icsShareToken: null, updatedAt: now },
    });

    await backfillEncryptedEventsToCiphertextOnly(this.prisma, {
      userId,
      calendarId: calendar.id,
      preserveReminderDependentShadows:
        normalizeEventEncryptionMode(userSettings?.eventEncryptionMode) !==
          "full" && calendar.forceFullEncryption !== true,
      now,
    });

    return { success: true };
  }

  async getSharedCalendarIcs(
    token: string,
    sourceUrl: string,
  ): Promise<{ icsContent: string; calendarName: string }> {
    const cleanToken = (token || "").trim().replace(/\.ics$/i, "");
    if (!cleanToken) {
      throw new NotFoundError("Shared calendar not found");
    }

    const calendar = await this.prisma.calendar.findFirst({
      where: { icsShareToken: cleanToken, icsShareEnabled: true },
      include: {
        events: {
          where: { parentEventId: null },
          orderBy: { start: "asc" },
        },
        user: { select: { name: true, email: true } },
      },
    });

    if (!calendar) {
      throw new NotFoundError("Shared calendar not found");
    }

    if (calendar.events.some((event) => event.encryptionState === "encrypted")) {
      throw new ValidationError(
        "This shared calendar contains fully encrypted events and cannot be exported.",
      );
    }

    const timezoneSource = calendar.events.find(
      (event) => !event.allDay && !!event.timezone,
    );

    const icsContent = buildIcsCalendar({
      calendar: {
        name: calendar.name,
        description: `Shared calendar from ${calendar.user.name || calendar.user.email}`,
        timezone: timezoneSource?.timezone || "UTC",
        sourceUrl,
      },
      events: calendar.events.map((event) => toIcsBuildEvent(event)),
    });

    return { icsContent, calendarName: calendar.name };
  }
}
