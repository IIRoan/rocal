import type { RowEncryptionState } from "../lib/encryption-state";
import type { Calendar } from "../generated/prisma/client.js";

export type CalendarCreateInput = {
  userId: string;
  name: string;
  color: string;
  isDefault?: boolean;
  encryptedName?: string;
  blindIndexTokens?: string[];
  encryptionState?: RowEncryptionState;
  encryptionKeyVersion?: number;
  forceFullEncryption?: boolean;
};

export type CalendarUpdateInput = {
  userId: string;
  calendarId: string;
  name?: string;
  color?: string;
  isVisible?: boolean;
  isDefault?: boolean;
  encryptedName?: string;
  blindIndexTokens?: string[];
  encryptionState?: RowEncryptionState;
  encryptionKeyVersion?: number;
  forceFullEncryption?: boolean;
};

export type CalendarDeleteInput = {
  userId: string;
  calendarId: string;
  action?: "delete_events" | "move_events";
  targetCalendarId?: string;
};

export type CalendarDeleteResult = {
  success: boolean;
  message: string;
  deletedCalendarId: string;
  eventsAffected: number;
  action: string;
};

export interface ICalendarService {
  list(userId: string): Promise<{ calendars: Calendar[] }>;
  create(input: CalendarCreateInput): Promise<Calendar>;
  update(input: CalendarUpdateInput): Promise<Calendar>;
  delete(input: CalendarDeleteInput): Promise<CalendarDeleteResult>;
}
