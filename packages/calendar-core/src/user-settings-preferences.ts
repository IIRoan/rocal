import { z } from "./zod";
import {
  riftboundImportedIdsSchema,
  riftboundPreferencesSchema,
} from "./riftbound-settings";
import { themeSchema } from "./route-schemas";
import type { UpdateSettingsRequest, UserSettings } from "./types";

/** Preferences only the apps read, sealed with the account key; the server keeps the time zone, time format, notification switches and default calendar. */
export const SEALED_USER_SETTINGS_FIELDS = [
  "theme",
  "defaultView",
  "weekStartDay",
  "workingHoursStart",
  "workingHoursEnd",
  "workingDays",
  "browserNotifications",
  "reminderSound",
  "defaultEventDuration",
  "compactView",
  "showWeekNumbers",
  "showDeclinedEvents",
  "riftbound",
  "riftboundImportedIds",
] as const satisfies ReadonlyArray<keyof UserSettings>;

export type UserSettingsPreferences = Pick<
  UserSettings,
  (typeof SEALED_USER_SETTINGS_FIELDS)[number]
>;

export const USER_SETTINGS_PREFERENCES_AAD = "user-settings:v1";

const WORKING_DAYS_MESSAGE = "Working days must be a JSON array of numbers 0-6";

function isWorkingDays(value: string): boolean {
  if (value === "") return true;
  try {
    const days: unknown = JSON.parse(value);
    return (
      Array.isArray(days) &&
      days.every((day) => typeof day === "number" && day >= 0 && day <= 6)
    );
  } catch {
    return false;
  }
}

/** The rules the server applied before it stopped seeing these fields. */
const preferenceSchemas = {
  theme: themeSchema,
  defaultView: z.enum(["month", "week", "3day", "day", "agenda"]),
  weekStartDay: z.number().int().min(0).max(6),
  workingHoursStart: z.number().int().min(0).max(1440),
  workingHoursEnd: z.number().int().min(0).max(1440),
  workingDays: z.string().refine(isWorkingDays, WORKING_DAYS_MESSAGE),
  browserNotifications: z.boolean(),
  reminderSound: z.boolean(),
  defaultEventDuration: z.number().int().min(1).max(2_147_483_647),
  compactView: z.boolean(),
  showWeekNumbers: z.boolean(),
  showDeclinedEvents: z.boolean(),
  riftbound: riftboundPreferencesSchema,
  riftboundImportedIds: riftboundImportedIdsSchema,
} satisfies Record<keyof UserSettingsPreferences, z.ZodTypeAny>;

function isSealedField(key: string): key is keyof UserSettingsPreferences {
  return key in preferenceSchemas;
}

/** Keeps each opened value that passes its rule, so one unknown or stale field never drops the rest. */
export function readUserSettingsPreferences(
  value: unknown,
): Partial<UserSettingsPreferences> {
  if (typeof value !== "object" || value === null) return {};
  const preferences: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (isSealedField(key) && preferenceSchemas[key].safeParse(entry).success) {
      preferences[key] = entry;
    }
  }
  // Each kept value passed its field's schema above.
  return preferences as Partial<UserSettingsPreferences>;
}

export function pickUserSettingsPreferences(
  settings: UserSettingsPreferences,
): UserSettingsPreferences {
  return Object.fromEntries(
    SEALED_USER_SETTINGS_FIELDS.map((field) => [field, settings[field]]),
  ) as UserSettingsPreferences;
}

/** Splits an update into what the server may read and the preferences to seal; throws on values the server used to refuse. */
export function splitUserSettingsUpdate(update: UpdateSettingsRequest): {
  readable: UpdateSettingsRequest;
  preferences: Partial<UserSettingsPreferences> | null;
} {
  const readable: Record<string, unknown> = {};
  const preferences: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(update)) {
    if (value === undefined) continue;
    if (!isSealedField(key)) {
      readable[key] = value;
      continue;
    }
    const parsed = preferenceSchemas[key].safeParse(value);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? `Invalid ${key}`);
    }
    preferences[key] = parsed.data;
  }
  if (
    typeof preferences.workingHoursStart === "number" &&
    typeof preferences.workingHoursEnd === "number" &&
    preferences.workingHoursStart >= preferences.workingHoursEnd
  ) {
    throw new Error("Working hours start must be before working hours end");
  }
  return {
    readable: readable as UpdateSettingsRequest,
    preferences: Object.keys(preferences).length
      ? (preferences as Partial<UserSettingsPreferences>)
      : null,
  };
}
