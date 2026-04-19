import type { UserSettings } from "../generated/prisma/index.js";

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
  defaultReminder?: number | null;
  defaultEventDuration?: number;
  defaultCalendarId?: string | null;
  compactView?: boolean;
  showWeekNumbers?: boolean;
  showDeclinedEvents?: boolean;
};

export interface ISettingsService {
  get(userId: string): Promise<UserSettings>;
  update(input: SettingsUpdateInput): Promise<UserSettings>;
  reset(userId: string): Promise<{ success: boolean; message: string }>;
}
