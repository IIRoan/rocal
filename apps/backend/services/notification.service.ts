import type { PrismaClient } from "../generated/prisma/index.js";
import type {
  INotificationService,
  NotificationConfigInput,
  NotificationRow,
  EventNotificationsResult,
  NotificationUpdateResult,
  NotificationDeleteResult,
} from "../contracts/notification.contract";
import { ValidationError, NotFoundError } from "../lib/errors";
import { NotificationCalculator } from "../lib/notification-calculator";

export class NotificationService implements INotificationService {
  constructor(private readonly prisma: PrismaClient) {}

  private async validateEventOwnership(eventId: string, userId: string) {
    if (
      eventId.includes("_") &&
      eventId.match(/_\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    ) {
      return null;
    }

    const event = await this.prisma.calendarEvent.findFirst({
      where: { id: eventId, userId },
      select: {
        id: true,
        start: true,
        timezone: true,
        title: true,
        isSynced: true,
      },
    });

    if (!event) {
      throw new NotFoundError("Event not found or access denied");
    }

    if (event.isSynced) {
      return null;
    }

    return event;
  }

  private validateNotificationConfig(config: NotificationConfigInput): void {
    if (
      !config.notificationType ||
      !["email", "browser"].includes(config.notificationType)
    ) {
      throw new ValidationError(
        "Invalid notification type. Must be 'email' or 'browser'.",
      );
    }

    if (typeof config.minutesBefore !== "number" || config.minutesBefore < 0) {
      throw new ValidationError("minutesBefore must be a non-negative number.");
    }

    if (config.minutesBefore > 43200) {
      throw new ValidationError(
        "minutesBefore cannot exceed 30 days (43200 minutes).",
      );
    }

    if (typeof config.isEnabled !== "boolean") {
      throw new ValidationError("isEnabled must be a boolean value.");
    }
  }

  async getForEvent(
    userId: string,
    eventId: string,
  ): Promise<EventNotificationsResult> {
    const event = await this.validateEventOwnership(eventId, userId);

    if (!event) {
      return {
        success: true,
        data: { eventId, notifications: [], count: 0 },
      };
    }

    const notifications = await this.prisma.$queryRaw<NotificationRow[]>`
      SELECT
        en.id,
        en.event_id AS "eventId",
        en.notification_type AS "notificationType",
        en.minutes_before AS "minutesBefore",
        en.notification_time AS "notificationTime",
        en.notification_date_local AS "notificationDateLocal",
        en.notification_timezone AS "notificationTimezone",
        en.is_enabled AS "isEnabled",
        en.is_sent AS "isSent",
        en.created_at AS "createdAt",
        en.updated_at AS "updatedAt"
      FROM public.event_notification en
      INNER JOIN public.calendar_event ce ON ce.id = en.event_id
      WHERE en.event_id = ${eventId}
        AND ce.user_id = ${userId}
      ORDER BY en.notification_type ASC, en.minutes_before ASC
    `;

    return {
      success: true,
      data: {
        eventId,
        notifications: notifications.map((n) => ({
          ...n,
          notificationTime: n.notificationTime.toISOString(),
          notificationDateLocal: n.notificationDateLocal,
          notificationTimezone: n.notificationTimezone,
          createdAt: n.createdAt.toISOString(),
          updatedAt: n.updatedAt.toISOString(),
        })),
        count: notifications.length,
      },
    };
  }

  async setForEvent(
    userId: string,
    eventId: string,
    notifications: NotificationConfigInput[],
  ): Promise<NotificationUpdateResult> {
    const event = await this.validateEventOwnership(eventId, userId);

    if (!event) {
      return {
        success: true,
        message: "No notifications to update for this event type",
      };
    }

    if (!Array.isArray(notifications)) {
      throw new ValidationError("notifications must be an array");
    }

    for (const config of notifications) {
      this.validateNotificationConfig(config);
    }

    const configKeys = notifications.map(
      (n) => `${n.notificationType}-${n.minutesBefore}`,
    );
    const uniqueKeys = new Set(configKeys);
    if (configKeys.length !== uniqueKeys.size) {
      throw new ValidationError(
        "Duplicate notification configurations are not allowed",
      );
    }

    await this.prisma.eventNotification.deleteMany({ where: { eventId } });

    const createdNotifications: Array<{
      id: string;
      notificationType: string;
      minutesBefore: number;
      notificationTime: Date;
      notificationDateLocal: string;
      notificationTimezone: string;
      isEnabled: boolean;
    }> = [];
    const skippedConfigurations: Array<{
      notificationType: string;
      minutesBefore: number;
      reason: string;
    }> = [];

    const now = new Date();
    const eventIsInPast = event.start <= now;

    if (eventIsInPast) {
      return {
        success: true,
        message: "Event is in the past; notifications skipped",
        data: {
          eventId,
          created: 0,
          skipped: notifications.length,
          details: {
            createdNotifications: [],
            skippedConfigurations: notifications.map((n) => ({
              notificationType: n.notificationType,
              minutesBefore: n.minutesBefore,
              reason: "event_in_past",
            })),
          },
        },
      };
    }

    for (const config of notifications) {
      if (!config.isEnabled) {
        skippedConfigurations.push({
          notificationType: config.notificationType,
          minutesBefore: config.minutesBefore,
          reason: "disabled",
        });
        continue;
      }

      const schedule = NotificationCalculator.buildNotificationSchedule(
        event.start,
        config.minutesBefore,
        event.timezone,
      );
      if (schedule.notificationTime <= now) {
        skippedConfigurations.push({
          notificationType: config.notificationType,
          minutesBefore: config.minutesBefore,
          reason: "notification_time_in_past",
        });
        continue;
      }

      const notificationId = crypto.randomUUID();
      await this.prisma.$executeRaw`
        INSERT INTO public.event_notification (
          id, event_id, notification_type, minutes_before,
          notification_time, notification_date_local, notification_timezone,
          is_enabled, is_sent, created_at, updated_at
        ) VALUES (
          ${notificationId}, ${eventId}, ${config.notificationType},
          ${config.minutesBefore}, ${schedule.notificationTime},
          ${schedule.notificationDateLocal}, ${schedule.notificationTimezone},
          true, false, NOW(), NOW()
        )
      `;
      createdNotifications.push({
        id: notificationId,
        notificationType: config.notificationType,
        minutesBefore: config.minutesBefore,
        notificationTime: schedule.notificationTime,
        notificationDateLocal: schedule.notificationDateLocal,
        notificationTimezone: schedule.notificationTimezone,
        isEnabled: true,
      });
    }

    return {
      success: true,
      message: "Event notifications updated successfully",
      data: {
        eventId,
        created: createdNotifications.length,
        skipped: skippedConfigurations.length,
        details: {
          createdNotifications: createdNotifications.map((n) => ({
            id: n.id,
            type: n.notificationType,
            minutesBefore: n.minutesBefore,
            notificationTime: n.notificationTime.toISOString(),
            notificationDateLocal: n.notificationDateLocal,
            notificationTimezone: n.notificationTimezone,
            isEnabled: n.isEnabled,
          })),
          skippedConfigurations,
        },
      },
    };
  }

  async deleteForEvent(
    userId: string,
    eventId: string,
  ): Promise<NotificationDeleteResult> {
    const event = await this.validateEventOwnership(eventId, userId);

    if (!event) {
      return {
        success: true,
        message: "No notifications to delete for this event type",
        deletedCount: 0,
      };
    }

    const deleteResult = await this.prisma.eventNotification.deleteMany({
      where: { eventId },
    });

    return {
      success: true,
      message: `Successfully deleted ${deleteResult.count} notifications for event`,
      data: { eventId, deletedCount: deleteResult.count },
    };
  }
}
