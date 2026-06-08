import type { PrismaClient, Prisma } from "../generated/prisma/index.js";
import type {
  ICalendarService,
  CalendarCreateInput,
  CalendarUpdateInput,
  CalendarDeleteInput,
  CalendarDeleteResult,
} from "../contracts/calendar.contract";
import { ValidationError, errorString} from "../lib/errors";
import { createLogger } from "@workspace/logger";
import {
  assertValidEntityColor,
  buildEncryptedNameFields,
  normalizeEntityName,
} from "../lib/entity-metadata";
import { ensureUserCalendars } from "../lib/user-setup";
import type { StalwartCalendarClientLike } from "../lib/stalwart-calendar";

const logger = createLogger("backend:calendar-service");

export class CalendarService implements ICalendarService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly stalwartClient?: StalwartCalendarClientLike | null,
  ) {}

  private async getStalwartAccountId(userId: string): Promise<string | null> {
    if (!this.stalwartClient) {
      return null;
    }

    const mailbox = await this.prisma.mailDirectoryEntry.findUnique({
      where: { userId },
      select: { stalwartAccountId: true },
    });

    return mailbox?.stalwartAccountId ?? null;
  }

  async list(userId: string) {
    await ensureUserCalendars(userId);

    const calendars = await this.prisma.calendar.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });

    return { calendars };
  }

  private async rollbackCreatedRemoteCalendar(
    accountId: string,
    calendarId: string,
  ): Promise<void> {
    if (!this.stalwartClient) {
      return;
    }

    try {
      await this.stalwartClient.deleteCalendar(accountId, calendarId);
    } catch (error) {
      logger.warn("Failed to roll back created Stalwart calendar", {
        accountId,
        calendarId,
        error: errorString(error),
      });
    }
  }

  private async rollbackUpdatedRemoteCalendar(input: {
    accountId: string;
    calendarId: string;
    previous: {
      name: string;
      color: string;
      isVisible: boolean;
      isDefault: boolean;
    };
  }): Promise<void> {
    if (!this.stalwartClient) {
      return;
    }

    try {
      await this.stalwartClient.updateCalendar(
        input.accountId,
        input.calendarId,
        input.previous,
      );
    } catch (error) {
      logger.warn("Failed to roll back updated Stalwart calendar", {
        accountId: input.accountId,
        calendarId: input.calendarId,
        error: errorString(error),
      });
    }
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

    const stalwartAccountId = await this.getStalwartAccountId(userId);
    let stalwartCalendarId: string | null = null;

    if (stalwartAccountId && this.stalwartClient) {
      const remoteCalendar = await this.stalwartClient.createCalendar(
        stalwartAccountId,
        {
          name: normalizedName,
          color,
          isVisible: true,
          isDefault: isDefault || false,
        },
      );
      stalwartCalendarId = remoteCalendar.id;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (isDefault) {
          await tx.calendar.updateMany({
            where: { userId, isDefault: true },
            data: { isDefault: false },
          });
        }

        return tx.calendar.create({
          data: {
            name: normalizedName,
            ...buildEncryptedNameFields({
              encryptedName,
              blindIndexTokens,
              encryptionState,
              encryptionKeyVersion,
            }),
            forceFullEncryption: forceFullEncryption ?? true,
            color,
            kind: "owned",
            isPublic: false,
            isVisible: true,
            isDefault: isDefault || false,
            ...(stalwartAccountId && stalwartCalendarId
              ? {
                  stalwartAccountId,
                  stalwartCalendarId,
                  stalwartSyncedAt: new Date(),
                }
              : {}),
            userId,
          },
        });
      });
    } catch (error) {
      if (stalwartAccountId && stalwartCalendarId) {
        await this.rollbackCreatedRemoteCalendar(
          stalwartAccountId,
          stalwartCalendarId,
        );
      }

      throw error;
    }
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

    const stalwartAccountId = await this.getStalwartAccountId(userId);
    let stalwartCalendarId = existingCalendar.stalwartCalendarId;
    let createdRemoteCalendarId: string | null = null;
    let updatedExistingRemoteCalendar = false;

    if (
      stalwartAccountId &&
      this.stalwartClient &&
      existingCalendar.kind === "owned" &&
      !existingCalendar.isSyncOnly
    ) {
      if (!stalwartCalendarId) {
        stalwartCalendarId = (
          await this.stalwartClient.createCalendar(stalwartAccountId, {
            name: normalizedName ?? existingCalendar.name,
            color: color ?? existingCalendar.color,
            isVisible: isVisible ?? existingCalendar.isVisible,
            isDefault: isDefault ?? existingCalendar.isDefault,
          })
        ).id;
        createdRemoteCalendarId = stalwartCalendarId;
      } else {
        const remotePatch = {
          ...(normalizedName !== undefined ? { name: normalizedName } : {}),
          ...(color !== undefined ? { color } : {}),
          ...(isVisible !== undefined ? { isVisible } : {}),
          ...(isDefault !== undefined ? { isDefault } : {}),
        };

        if (Object.keys(remotePatch).length > 0) {
          await this.stalwartClient.updateCalendar(
            stalwartAccountId,
            stalwartCalendarId,
            remotePatch,
          );
          updatedExistingRemoteCalendar = true;
        }
      }
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
    }

    const enablingForceFullEncryption =
      forceFullEncryption === true &&
      existingCalendar.forceFullEncryption !== true;

    if (forceFullEncryption !== undefined) {
      updateData.forceFullEncryption = forceFullEncryption;
    }

    if (stalwartAccountId && stalwartCalendarId) {
      updateData.stalwartAccountId = stalwartAccountId;
      updateData.stalwartCalendarId = stalwartCalendarId;
      updateData.stalwartSyncedAt = new Date();
    }

    updateData.updatedAt = new Date();

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (isDefault) {
          await tx.calendar.updateMany({
            where: { userId, isDefault: true, id: { not: calendarId } },
            data: { isDefault: false },
          });
        }

        const updatedCalendar = await tx.calendar.update({
          where: { id: calendarId },
          data: updateData,
        });

        if (enablingForceFullEncryption) {
          // Backfill: any event in this calendar that already has an encrypted
          // payload should drop its plaintext shadows and become fully ciphertext.
          // Events without an encryptedContent payload (legacy plaintext) are
          // left untouched – they require a client-side re-encryption pass.
          await tx.calendarEvent.updateMany({
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
      });
    } catch (error) {
      if (stalwartAccountId && createdRemoteCalendarId) {
        await this.rollbackCreatedRemoteCalendar(
          stalwartAccountId,
          createdRemoteCalendarId,
        );
      } else if (
        stalwartAccountId &&
        updatedExistingRemoteCalendar &&
        existingCalendar.stalwartCalendarId
      ) {
        await this.rollbackUpdatedRemoteCalendar({
          accountId: stalwartAccountId,
          calendarId: existingCalendar.stalwartCalendarId,
          previous: {
            name: existingCalendar.name,
            color: existingCalendar.color,
            isVisible: existingCalendar.isVisible,
            isDefault: existingCalendar.isDefault,
          },
        });
      }

      throw error;
    }
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

        if (
          this.stalwartClient &&
          existingCalendar.stalwartAccountId &&
          existingCalendar.stalwartCalendarId &&
          targetCalendar.stalwartCalendarId
        ) {
          const remoteEvents = await this.prisma.calendarEvent.findMany({
            where: {
              calendarId,
              stalwartEventId: { not: null },
            },
            select: {
              stalwartEventId: true,
            },
          });

          for (const event of remoteEvents) {
            if (!event.stalwartEventId) continue;
            await this.stalwartClient.updateEvent({
              accountId: existingCalendar.stalwartAccountId,
              eventId: event.stalwartEventId,
              patch: {
                calendarIds: {
                  [targetCalendar.stalwartCalendarId]: true,
                },
              },
            });
          }
        }

        await this.prisma.calendarEvent.updateMany({
          where: { calendarId },
          data: {
            calendarId: targetCalendarId,
            stalwartCalendarId: targetCalendar.stalwartCalendarId,
            updatedAt: new Date(),
          },
        });

        if (
          this.stalwartClient &&
          existingCalendar.stalwartAccountId &&
          existingCalendar.stalwartCalendarId
        ) {
          await this.stalwartClient.deleteCalendar(
            existingCalendar.stalwartAccountId,
            existingCalendar.stalwartCalendarId,
          );
        }
      } else {
        if (
          this.stalwartClient &&
          existingCalendar.stalwartAccountId &&
          existingCalendar.stalwartCalendarId
        ) {
          await this.stalwartClient.deleteCalendar(
            existingCalendar.stalwartAccountId,
            existingCalendar.stalwartCalendarId,
            { removeEvents: true },
          );
        }

        await this.prisma.calendarEvent.deleteMany({
          where: { calendarId },
        });
      }
    } else if (
      this.stalwartClient &&
      existingCalendar.stalwartAccountId &&
      existingCalendar.stalwartCalendarId
    ) {
      await this.stalwartClient.deleteCalendar(
        existingCalendar.stalwartAccountId,
        existingCalendar.stalwartCalendarId,
      );
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
