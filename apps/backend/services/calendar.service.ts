import type { PrismaClient, Prisma } from "../generated/prisma/index.js";
import type {
  ICalendarService,
  CalendarCreateInput,
  CalendarUpdateInput,
  CalendarDeleteInput,
  CalendarDeleteResult,
} from "../contracts/calendar.contract";
import { ValidationError } from "../lib/errors";
import {
  assertValidEntityColor,
  buildEncryptedNameFields,
  normalizeEntityName,
} from "../lib/entity-metadata";
import { ensureUserCalendars } from "../lib/user-setup";

export class CalendarService implements ICalendarService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(userId: string) {
    await ensureUserCalendars(userId);

    const calendars = await this.prisma.calendar.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });

    return { calendars };
  }

  async create(input: CalendarCreateInput) {
    const {
      userId,
      name,
      color,
      isDefault,
      encryptedName,
      blindIndexTokens,
      encryptionState,
      encryptionKeyVersion,
      forceFullEncryption,
    } = input;

    const normalizedName = normalizeEntityName(name, {
      entityLabel: "Calendar",
    });

    assertValidEntityColor(color);

    const existingCalendar = await this.prisma.calendar.findFirst({
      where: { userId, name: normalizedName },
    });

    if (existingCalendar) {
      throw new ValidationError(
        "A calendar with this name already exists",
        "name",
      );
    }

    if (isDefault) {
      await this.prisma.calendar.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.calendar.create({
      data: {
        name: normalizedName,
        ...buildEncryptedNameFields({
          encryptedName,
          blindIndexTokens,
          encryptionState,
          encryptionKeyVersion,
        }),
        ...(forceFullEncryption !== undefined ? { forceFullEncryption } : {}),
        color,
        kind: "owned",
        isPublic: false,
        isVisible: true,
        isDefault: isDefault || false,
        userId,
      },
    });
  }

  async update(input: CalendarUpdateInput) {
    const {
      userId,
      calendarId,
      name,
      color,
      isVisible,
      isDefault,
      encryptedName,
      blindIndexTokens,
      encryptionState,
      encryptionKeyVersion,
      forceFullEncryption,
    } = input;

    const normalizedName =
      name !== undefined
        ? normalizeEntityName(name, { entityLabel: "Calendar" })
        : undefined;

    const existingCalendar = await this.prisma.calendar.findFirst({
      where: { id: calendarId, userId },
    });

    if (!existingCalendar) {
      throw new ValidationError("Calendar not found or access denied");
    }

    const isVisibilityOnlyUpdate =
      isVisible !== undefined &&
      name === undefined &&
      color === undefined &&
      isDefault === undefined &&
      forceFullEncryption === undefined;

    if (existingCalendar.kind !== "owned" && !isVisibilityOnlyUpdate) {
      throw new ValidationError(
        "Only owned calendars can be updated here. Manage subscribed or public calendars from subscriptions instead.",
      );
    }

    if (normalizedName !== undefined) {
      const existingNameCalendar = await this.prisma.calendar.findFirst({
        where: {
          userId,
          name: normalizedName,
          id: { not: calendarId },
        },
      });

      if (existingNameCalendar) {
        throw new ValidationError(
          "A calendar with this name already exists",
          "name",
        );
      }
    }

    if (color !== undefined) {
      assertValidEntityColor(color);
    }

    const updateData: Prisma.CalendarUpdateInput = {};

    if (normalizedName !== undefined) updateData.name = normalizedName;
    if (color !== undefined) updateData.color = color;
    if (isVisible !== undefined) updateData.isVisible = isVisible;
    Object.assign(
      updateData,
      buildEncryptedNameFields({
        encryptedName,
        blindIndexTokens,
        encryptionState,
        encryptionKeyVersion,
      }),
    );
    if (isDefault !== undefined) {
      updateData.isDefault = isDefault;
      if (isDefault) {
        await this.prisma.calendar.updateMany({
          where: { userId, isDefault: true, id: { not: calendarId } },
          data: { isDefault: false },
        });
      }
    }

    const enablingForceFullEncryption =
      forceFullEncryption === true &&
      existingCalendar.forceFullEncryption !== true;

    if (forceFullEncryption !== undefined) {
      updateData.forceFullEncryption = forceFullEncryption;
    }

    updateData.updatedAt = new Date();

    const updatedCalendar = await this.prisma.calendar.update({
      where: { id: calendarId },
      data: updateData,
    });

    if (enablingForceFullEncryption) {
      // Backfill: any event in this calendar that already has an encrypted
      // payload should drop its plaintext shadows and become fully ciphertext.
      // Events without an encryptedContent payload (legacy plaintext) are
      // left untouched – they require a client-side re-encryption pass.
      await this.prisma.calendarEvent.updateMany({
        where: {
          calendarId,
          userId,
          encryptedContent: { not: null },
        },
        data: {
          title: "",
          description: null,
          location: null,
          encryptionState: "encrypted",
        },
      });
    }

    return updatedCalendar;
  }

  async delete(input: CalendarDeleteInput): Promise<CalendarDeleteResult> {
    const {
      userId,
      calendarId,
      action = "delete_events",
      targetCalendarId,
    } = input;

    const existingCalendar = await this.prisma.calendar.findFirst({
      where: { id: calendarId, userId },
    });

    if (!existingCalendar) {
      throw new ValidationError("Calendar not found or access denied");
    }

    if (existingCalendar.kind !== "owned") {
      throw new ValidationError(
        "Only owned calendars can be deleted here. Manage subscribed or public calendars from subscriptions instead.",
      );
    }

    const calendarCount = await this.prisma.calendar.count({
      where: { userId, kind: "owned" },
    });

    if (calendarCount <= 1) {
      throw new ValidationError(
        "Cannot delete the last editable calendar. Create another calendar first.",
        "calendarId",
      );
    }

    const eventCount = await this.prisma.calendarEvent.count({
      where: { calendarId },
    });

    if (eventCount > 0) {
      if (action === "move_events") {
        if (!targetCalendarId) {
          throw new ValidationError(
            "Target calendar ID is required when moving events",
            "targetCalendarId",
          );
        }

        const targetCalendar = await this.prisma.calendar.findFirst({
          where: { id: targetCalendarId, userId },
        });

        if (!targetCalendar) {
          throw new ValidationError(
            "Target calendar not found or access denied",
            "targetCalendarId",
          );
        }

        if (targetCalendarId === calendarId) {
          throw new ValidationError(
            "Cannot move events to the same calendar being deleted",
            "targetCalendarId",
          );
        }

        await this.prisma.calendarEvent.updateMany({
          where: { calendarId },
          data: { calendarId: targetCalendarId, updatedAt: new Date() },
        });
      } else {
        await this.prisma.calendarEvent.deleteMany({
          where: { calendarId },
        });
      }
    }

    if (existingCalendar.isDefault) {
      const nextCalendar = await this.prisma.calendar.findFirst({
        where: { userId, id: { not: calendarId } },
        orderBy: { createdAt: "asc" },
      });

      if (nextCalendar) {
        await this.prisma.calendar.update({
          where: { id: nextCalendar.id },
          data: { isDefault: true },
        });
      }
    }

    await this.prisma.calendar.delete({ where: { id: calendarId } });

    return {
      success: true,
      message:
        action === "move_events"
          ? `Calendar deleted successfully. ${eventCount} events moved to target calendar.`
          : eventCount > 0
            ? `Calendar deleted successfully. ${eventCount} events were also deleted.`
            : "Calendar deleted successfully.",
      deletedCalendarId: calendarId,
      eventsAffected: eventCount,
      action: action || "delete_events",
    };
  }
}
