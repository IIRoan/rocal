import { z } from "zod";
import { notificationTypeSchema } from "@workspace/calendar-core";
import { strictZodObject } from "../lib/validation";
import { eventIdParamsSchema } from "./_schemas";

export const eventNotificationSettingSchema = strictZodObject({
  notificationType: notificationTypeSchema,
  minutesBefore: z.number().int().min(0).max(43200),
  isEnabled: z.boolean(),
});

export const updateEventNotificationsBodySchema = strictZodObject({
  notifications: z.array(eventNotificationSettingSchema).max(20),
  displayTitle: z.string().max(500).nullable().optional(),
});

export { eventIdParamsSchema };

export type NotificationConfigInput = z.infer<
  typeof eventNotificationSettingSchema
>;

export type NotificationRow = {
  id: string;
  eventId: string;
  notificationType: string;
  minutesBefore: number;
  notificationTime: Date;
  notificationDateLocal: string;
  notificationTimezone: string;
  isEnabled: boolean;
  isSent: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type SerializedNotification = {
  id: string;
  eventId: string;
  notificationType: string;
  minutesBefore: number;
  notificationTime: string;
  notificationDateLocal: string;
  notificationTimezone: string;
  isEnabled: boolean;
  isSent: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EventNotificationsResult = {
  success: boolean;
  data: {
    eventId: string;
    notifications: SerializedNotification[];
    count: number;
  };
};

export type NotificationUpdateResult = {
  success: boolean;
  message: string;
  data?: {
    eventId: string;
    created: number;
    skipped: number;
    details: {
      createdNotifications: Array<{
        id: string;
        type: string;
        minutesBefore: number;
        notificationTime: string;
        notificationDateLocal: string;
        notificationTimezone: string;
        isEnabled: boolean;
      }>;
      skippedConfigurations: Array<{
        notificationType: string;
        minutesBefore: number;
        reason: string;
      }>;
    };
  };
};

export type NotificationDeleteResult = {
  success: boolean;
  message: string;
  data?: {
    eventId: string;
    deletedCount: number;
  };
  deletedCount?: number;
};

export interface INotificationService {
  getForEvent(
    userId: string,
    eventId: string,
  ): Promise<EventNotificationsResult>;
  setForEvent(
    userId: string,
    eventId: string,
    notifications: NotificationConfigInput[],
    displayTitle?: string | null,
  ): Promise<NotificationUpdateResult>;
  deleteForEvent(
    userId: string,
    eventId: string,
  ): Promise<NotificationDeleteResult>;
}
