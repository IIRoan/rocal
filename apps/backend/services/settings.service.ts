import type { PrismaClient } from "../generated/prisma/index.js";
import type {
  ISettingsService,
  PublicUserSettings,
  SettingsUpdateInput,
} from "../contracts/settings.contract";
import { ValidationError } from "../lib/errors";
import { normalizeEventEncryptionMode } from "../lib/event-encryption";

function toPublicUserSettings(settings: {
  defaultReminder: number | null;
} & Record<string, unknown>): PublicUserSettings {
  const { defaultReminder: _defaultReminder, ...publicSettings } = settings;
  return publicSettings as PublicUserSettings;
}

export class SettingsService implements ISettingsService {
  constructor(private readonly prisma: PrismaClient) {}

  async get(userId: string) {
    let settings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });

    if (!settings) {
      settings = await this.prisma.userSettings.create({
        data: { userId },
      });
    }

    return toPublicUserSettings(settings);
  }

  async update(input: SettingsUpdateInput) {
    const { userId, ...body } = input;
    const normalizedBody = {
      ...body,
      ...(body.eventEncryptionMode !== undefined
        ? { eventEncryptionMode: normalizeEventEncryptionMode(body.eventEncryptionMode) }
        : {}),
    };

    if (normalizedBody.timezone) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: normalizedBody.timezone });
      } catch {
        throw new ValidationError("Invalid timezone identifier", "timezone");
      }
    }

    if (
      normalizedBody.workingHoursStart !== undefined &&
      normalizedBody.workingHoursEnd !== undefined
    ) {
      if (normalizedBody.workingHoursStart >= normalizedBody.workingHoursEnd) {
        throw new ValidationError(
          "Working hours start must be before working hours end",
          "workingHoursStart",
        );
      }
    }

    if (normalizedBody.workingDays) {
      try {
        const workingDays = JSON.parse(normalizedBody.workingDays);
        if (
          !Array.isArray(workingDays) ||
          !workingDays.every(
            (day: unknown) => typeof day === "number" && day >= 0 && day <= 6,
          )
        ) {
          throw new ValidationError(
            "Working days must be a JSON array of numbers 0-6",
            "workingDays",
          );
        }
      } catch (e) {
        if (e instanceof ValidationError) throw e;
        throw new ValidationError(
          "Invalid working days format - must be valid JSON array",
          "workingDays",
        );
      }
    }

    if (normalizedBody.defaultCalendarId) {
      const calendar = await this.prisma.calendar.findFirst({
        where: { id: normalizedBody.defaultCalendarId, userId },
      });

      if (!calendar) {
        throw new ValidationError(
          "Invalid default calendar or calendar does not belong to user",
          "defaultCalendarId",
        );
      }

      if (calendar.kind !== "owned") {
        throw new ValidationError(
          "The default calendar must be one of your editable calendars.",
          "defaultCalendarId",
        );
      }
    }

    const disableCalendarSharing = normalizedBody.eventEncryptionMode === "full";

    if (!disableCalendarSharing) {
      const settings = await this.prisma.userSettings.upsert({
        where: { userId },
        update: { ...normalizedBody, updatedAt: new Date() },
        create: { userId, ...normalizedBody },
      });

      return toPublicUserSettings(settings);
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const settings = await tx.userSettings.upsert({
        where: { userId },
        update: { ...normalizedBody, updatedAt: now },
        create: { userId, ...normalizedBody },
      });

      await tx.calendar.updateMany({
        where: { userId, icsShareEnabled: true },
        data: {
          icsShareEnabled: false,
          icsShareToken: null,
          updatedAt: now,
        },
      });

      return toPublicUserSettings(settings);
    });
  }

  async reset(userId: string) {
    await this.prisma.userSettings.deleteMany({
      where: { userId },
    });

    return { success: true, message: "User settings reset to defaults" };
  }
}
