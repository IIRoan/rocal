import type { PrismaClient } from "../generated/prisma/index.js";
import type { ISettingsService, SettingsUpdateInput } from "../contracts/settings.contract";
import { ValidationError } from "../lib/errors";

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

    return settings;
  }

  async update(input: SettingsUpdateInput) {
    const { userId, ...body } = input;

    if (body.timezone) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: body.timezone });
      } catch {
        throw new ValidationError("Invalid timezone identifier", "timezone");
      }
    }

    if (
      body.workingHoursStart !== undefined &&
      body.workingHoursEnd !== undefined
    ) {
      if (body.workingHoursStart >= body.workingHoursEnd) {
        throw new ValidationError(
          "Working hours start must be before working hours end",
          "workingHoursStart",
        );
      }
    }

    if (body.workingDays) {
      try {
        const workingDays = JSON.parse(body.workingDays);
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

    if (body.defaultCalendarId) {
      const calendar = await this.prisma.calendar.findFirst({
        where: { id: body.defaultCalendarId, userId },
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

    return this.prisma.userSettings.upsert({
      where: { userId },
      update: { ...body, updatedAt: new Date() },
      create: { userId, ...body },
    });
  }

  async reset(userId: string) {
    await this.prisma.userSettings.deleteMany({
      where: { userId },
    });

    return { success: true, message: "User settings reset to defaults" };
  }
}
