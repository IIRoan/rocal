import type { UserSettings as PrismaUserSettings } from "../generated/prisma/client.js";

export type PublicUserSettings = Omit<PrismaUserSettings, "defaultReminder">;

export type SettingsUpdateInput = {
  userId: string;
  theme?: "light" | "dark" | "system";
  defaultView?: "month" | "week" | "day" | "agenda";
  weekStartDay?: number;
  timezone?: string;
  timeFormat?: "12h" | "24h";
  workingHoursStart?: number;
  workingHoursEnd?: number;
  workingDays?: string;
  emailNotifications?: boolean;
  browserNotifications?: boolean;
  reminderSound?: boolean;
  eventEncryptionMode?: "hybrid" | "full";
  defaultEventDuration?: number;
  defaultCalendarId?: string | null;
  compactView?: boolean;
  showWeekNumbers?: boolean;
  showDeclinedEvents?: boolean;
};

export interface ISettingsService {
  get(userId: string): Promise<PublicUserSettings>;
  update(input: SettingsUpdateInput): Promise<PublicUserSettings>;
  reset(userId: string): Promise<{ success: boolean; message: string }>;
}
