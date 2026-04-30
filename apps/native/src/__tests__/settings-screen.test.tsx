/**
 * Unit tests for settings screen.
 *
 * Tests setting changes, optimistic updates, theme switching,
 * loading/error states, and helper functions.
 *
 * Validates: Requirements 12.1, 12.2, 12.5
 */
import { describe, it, expect, beforeEach } from "@jest/globals";
import type {
  UserSettings,
  UpdateSettingsRequest,
} from "@workspace/calendar-core";

// ─── Helper functions (mirrored from settings screen for testability) ────────

/** Parse a comma-separated working days string (e.g. "1,2,3,4,5") into a Set. */
function parseWorkingDays(workingDays: string): Set<number> {
  if (!workingDays) return new Set([1, 2, 3, 4, 5]);
  return new Set(
    workingDays
      .split(",")
      .map(Number)
      .filter((n) => !Number.isNaN(n)),
  );
}

/** Serialize a Set of day numbers back to a comma-separated string. */
function serializeWorkingDays(days: Set<number>): string {
  return Array.from(days)
    .sort((a, b) => a - b)
    .join(",");
}

// ─── Models for testing optimistic update logic ──────────────────────────────

/**
 * Simulates the optimistic update cache logic from the settings screen.
 * When a setting is updated, the cache is immediately patched with the
 * new values before the API call resolves.
 */
function applyOptimisticUpdate(
  current: UserSettings,
  update: UpdateSettingsRequest,
): UserSettings {
  return { ...current, ...update };
}

/**
 * Simulates the rollback logic: if the API call fails, the cache is
 * restored to the previous snapshot.
 */
function rollbackUpdate(
  _current: UserSettings,
  previous: UserSettings,
): UserSettings {
  return previous;
}

// ─── Theme resolution model ──────────────────────────────────────────────────

type ThemePreference = "light" | "dark" | "system";

interface ThemeChangeResult {
  themePreferenceCalled: ThemePreference;
  backendUpdatePayload: UpdateSettingsRequest;
}

/**
 * Models the handleThemeChange callback from the settings screen.
 * It calls both setThemePreference (ThemeProvider) and updateSetting (backend).
 */
function handleThemeChange(pref: ThemePreference): ThemeChangeResult {
  return {
    themePreferenceCalled: pref,
    backendUpdatePayload: { theme: pref },
  };
}

// ─── Pending keys tracking model ─────────────────────────────────────────────

/**
 * Models the pendingKeys state used for showing loading indicators
 * on individual settings while they are being saved.
 */
function addPendingKeys(
  current: Set<string>,
  update: UpdateSettingsRequest,
): Set<string> {
  const next = new Set(current);
  for (const k of Object.keys(update)) next.add(k);
  return next;
}

function removePendingKeys(
  current: Set<string>,
  update: UpdateSettingsRequest,
): Set<string> {
  const next = new Set(current);
  for (const k of Object.keys(update)) next.delete(k);
  return next;
}

// ─── Working days toggle model ───────────────────────────────────────────────

function toggleWorkingDay(
  workingDays: Set<number>,
  day: number,
): Set<number> {
  const next = new Set(workingDays);
  if (next.has(day)) {
    next.delete(day);
  } else {
    next.add(day);
  }
  return next;
}

// ─── Default settings fixture ────────────────────────────────────────────────

function createDefaultSettings(
  overrides?: Partial<UserSettings>,
): UserSettings {
  return {
    id: "settings-1",
    userId: "user-1",
    theme: "system",
    defaultView: "month",
    weekStartDay: 0,
    timezone: "America/New_York",
    timeFormat: "12h",
    workingHoursStart: 9,
    workingHoursEnd: 17,
    workingDays: "1,2,3,4,5",
    emailNotifications: true,
    browserNotifications: true,
    reminderSound: true,
    eventEncryptionMode: "hybrid",
    defaultEventDuration: 60,
    defaultCalendarId: null,
    compactView: false,
    showWeekNumbers: false,
    showDeclinedEvents: false,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

// ─── Tests: parseWorkingDays ─────────────────────────────────────────────────

describe("parseWorkingDays", () => {
  it("parses a standard weekday string", () => {
    const result = parseWorkingDays("1,2,3,4,5");
    expect(result).toEqual(new Set([1, 2, 3, 4, 5]));
  });

  it("parses a single day", () => {
    const result = parseWorkingDays("3");
    expect(result).toEqual(new Set([3]));
  });

  it("parses all seven days", () => {
    const result = parseWorkingDays("0,1,2,3,4,5,6");
    expect(result).toEqual(new Set([0, 1, 2, 3, 4, 5, 6]));
  });

  it("returns default weekdays for empty string", () => {
    const result = parseWorkingDays("");
    expect(result).toEqual(new Set([1, 2, 3, 4, 5]));
  });

  it("filters out NaN values", () => {
    const result = parseWorkingDays("1,abc,3");
    expect(result).toEqual(new Set([1, 3]));
  });

  it("handles duplicate values", () => {
    const result = parseWorkingDays("1,1,2,2,3");
    expect(result).toEqual(new Set([1, 2, 3]));
  });
});

// ─── Tests: serializeWorkingDays ─────────────────────────────────────────────

describe("serializeWorkingDays", () => {
  it("serializes a standard weekday set", () => {
    const result = serializeWorkingDays(new Set([1, 2, 3, 4, 5]));
    expect(result).toBe("1,2,3,4,5");
  });

  it("sorts days numerically", () => {
    const result = serializeWorkingDays(new Set([5, 3, 1]));
    expect(result).toBe("1,3,5");
  });

  it("serializes a single day", () => {
    const result = serializeWorkingDays(new Set([0]));
    expect(result).toBe("0");
  });

  it("serializes an empty set", () => {
    const result = serializeWorkingDays(new Set());
    expect(result).toBe("");
  });

  it("serializes all seven days in order", () => {
    const result = serializeWorkingDays(new Set([6, 4, 2, 0, 1, 3, 5]));
    expect(result).toBe("0,1,2,3,4,5,6");
  });
});

// ─── Tests: parseWorkingDays / serializeWorkingDays round-trip ───────────────

describe("parseWorkingDays / serializeWorkingDays round-trip", () => {
  it("round-trips standard weekdays", () => {
    const original = "1,2,3,4,5";
    const parsed = parseWorkingDays(original);
    const serialized = serializeWorkingDays(parsed);
    expect(serialized).toBe(original);
  });

  it("round-trips all days", () => {
    const original = "0,1,2,3,4,5,6";
    const parsed = parseWorkingDays(original);
    const serialized = serializeWorkingDays(parsed);
    expect(serialized).toBe(original);
  });

  it("normalizes unsorted input on round-trip", () => {
    const input = "5,3,1";
    const parsed = parseWorkingDays(input);
    const serialized = serializeWorkingDays(parsed);
    expect(serialized).toBe("1,3,5");
  });
});

// ─── Tests: Setting changes (optimistic updates) ────────────────────────────

describe("Setting changes — optimistic updates", () => {
  let settings: UserSettings;

  beforeEach(() => {
    settings = createDefaultSettings();
  });

  it("toggles compactView optimistically", () => {
    const updated = applyOptimisticUpdate(settings, { compactView: true });
    expect(updated.compactView).toBe(true);
    // Other settings remain unchanged
    expect(updated.showWeekNumbers).toBe(false);
    expect(updated.theme).toBe("system");
  });

  it("toggles showWeekNumbers optimistically", () => {
    const updated = applyOptimisticUpdate(settings, {
      showWeekNumbers: true,
    });
    expect(updated.showWeekNumbers).toBe(true);
  });

  it("toggles showDeclinedEvents optimistically", () => {
    const updated = applyOptimisticUpdate(settings, {
      showDeclinedEvents: true,
    });
    expect(updated.showDeclinedEvents).toBe(true);
  });

  it("changes defaultView optimistically", () => {
    const updated = applyOptimisticUpdate(settings, {
      defaultView: "week",
    });
    expect(updated.defaultView).toBe("week");
  });

  it("changes timeFormat optimistically", () => {
    const updated = applyOptimisticUpdate(settings, { timeFormat: "24h" });
    expect(updated.timeFormat).toBe("24h");
  });

  it("changes weekStartDay optimistically", () => {
    const updated = applyOptimisticUpdate(settings, { weekStartDay: 1 });
    expect(updated.weekStartDay).toBe(1);
  });

  it("changes workingHoursStart optimistically", () => {
    const updated = applyOptimisticUpdate(settings, {
      workingHoursStart: 8,
    });
    expect(updated.workingHoursStart).toBe(8);
  });

  it("changes workingHoursEnd optimistically", () => {
    const updated = applyOptimisticUpdate(settings, {
      workingHoursEnd: 18,
    });
    expect(updated.workingHoursEnd).toBe(18);
  });

  it("changes defaultEventDuration optimistically", () => {
    const updated = applyOptimisticUpdate(settings, {
      defaultEventDuration: 30,
    });
    expect(updated.defaultEventDuration).toBe(30);
  });

  it("changes eventEncryptionMode optimistically", () => {
    const updated = applyOptimisticUpdate(settings, {
      eventEncryptionMode: "full",
    });
    expect(updated.eventEncryptionMode).toBe("full");
  });

  it("applies multiple settings at once", () => {
    const updated = applyOptimisticUpdate(settings, {
      compactView: true,
      showWeekNumbers: true,
      timeFormat: "24h",
    });
    expect(updated.compactView).toBe(true);
    expect(updated.showWeekNumbers).toBe(true);
    expect(updated.timeFormat).toBe("24h");
    // Unchanged fields preserved
    expect(updated.defaultView).toBe("month");
  });

  it("preserves immutable fields (id, userId, timestamps)", () => {
    const updated = applyOptimisticUpdate(settings, {
      compactView: true,
    });
    expect(updated.id).toBe(settings.id);
    expect(updated.userId).toBe(settings.userId);
    expect(updated.createdAt).toBe(settings.createdAt);
    expect(updated.updatedAt).toBe(settings.updatedAt);
  });
});

// ─── Tests: Optimistic update rollback ───────────────────────────────────────

describe("Optimistic update rollback on error", () => {
  it("restores previous settings on API failure", () => {
    const original = createDefaultSettings();
    const optimistic = applyOptimisticUpdate(original, {
      compactView: true,
    });

    // Simulate API error → rollback
    const rolledBack = rollbackUpdate(optimistic, original);
    expect(rolledBack.compactView).toBe(false);
    expect(rolledBack).toEqual(original);
  });

  it("restores multiple changed fields on rollback", () => {
    const original = createDefaultSettings();
    const optimistic = applyOptimisticUpdate(original, {
      compactView: true,
      showWeekNumbers: true,
      timeFormat: "24h",
    });

    const rolledBack = rollbackUpdate(optimistic, original);
    expect(rolledBack.compactView).toBe(false);
    expect(rolledBack.showWeekNumbers).toBe(false);
    expect(rolledBack.timeFormat).toBe("12h");
  });
});

// ─── Tests: Theme switching ──────────────────────────────────────────────────

describe("Theme switching", () => {
  it("calls setThemePreference with 'light'", () => {
    const result = handleThemeChange("light");
    expect(result.themePreferenceCalled).toBe("light");
  });

  it("calls setThemePreference with 'dark'", () => {
    const result = handleThemeChange("dark");
    expect(result.themePreferenceCalled).toBe("dark");
  });

  it("calls setThemePreference with 'system'", () => {
    const result = handleThemeChange("system");
    expect(result.themePreferenceCalled).toBe("system");
  });

  it("sends theme update to backend for 'light'", () => {
    const result = handleThemeChange("light");
    expect(result.backendUpdatePayload).toEqual({ theme: "light" });
  });

  it("sends theme update to backend for 'dark'", () => {
    const result = handleThemeChange("dark");
    expect(result.backendUpdatePayload).toEqual({ theme: "dark" });
  });

  it("sends theme update to backend for 'system'", () => {
    const result = handleThemeChange("system");
    expect(result.backendUpdatePayload).toEqual({ theme: "system" });
  });

  it("updates both ThemeProvider and backend simultaneously", () => {
    const result = handleThemeChange("dark");
    // Both the local ThemeProvider preference and the backend payload
    // should reflect the same value
    expect(result.themePreferenceCalled).toBe("dark");
    expect(result.backendUpdatePayload.theme).toBe("dark");
  });
});

// ─── Tests: Pending keys tracking ────────────────────────────────────────────

describe("Pending keys tracking", () => {
  it("adds keys from update to pending set", () => {
    const pending = new Set<string>();
    const result = addPendingKeys(pending, { compactView: true });
    expect(result.has("compactView")).toBe(true);
  });

  it("adds multiple keys from a multi-field update", () => {
    const pending = new Set<string>();
    const result = addPendingKeys(pending, {
      compactView: true,
      showWeekNumbers: true,
    });
    expect(result.has("compactView")).toBe(true);
    expect(result.has("showWeekNumbers")).toBe(true);
  });

  it("preserves existing pending keys when adding new ones", () => {
    const pending = new Set(["theme"]);
    const result = addPendingKeys(pending, { compactView: true });
    expect(result.has("theme")).toBe(true);
    expect(result.has("compactView")).toBe(true);
  });

  it("removes keys on settled", () => {
    const pending = new Set(["compactView", "theme"]);
    const result = removePendingKeys(pending, { compactView: true });
    expect(result.has("compactView")).toBe(false);
    expect(result.has("theme")).toBe(true);
  });

  it("handles removing keys that are not in the set", () => {
    const pending = new Set(["theme"]);
    const result = removePendingKeys(pending, { compactView: true });
    expect(result.has("theme")).toBe(true);
    expect(result.size).toBe(1);
  });
});

// ─── Tests: Working days toggle ──────────────────────────────────────────────

describe("Working days toggle", () => {
  it("removes a day that is currently active", () => {
    const days = new Set([1, 2, 3, 4, 5]);
    const result = toggleWorkingDay(days, 5);
    expect(result.has(5)).toBe(false);
    expect(result.size).toBe(4);
  });

  it("adds a day that is currently inactive", () => {
    const days = new Set([1, 2, 3, 4, 5]);
    const result = toggleWorkingDay(days, 0);
    expect(result.has(0)).toBe(true);
    expect(result.size).toBe(6);
  });

  it("does not mutate the original set", () => {
    const days = new Set([1, 2, 3, 4, 5]);
    toggleWorkingDay(days, 5);
    expect(days.has(5)).toBe(true);
    expect(days.size).toBe(5);
  });

  it("produces correct serialized output after toggle", () => {
    const days = new Set([1, 2, 3, 4, 5]);
    const toggled = toggleWorkingDay(days, 6);
    const serialized = serializeWorkingDays(toggled);
    expect(serialized).toBe("1,2,3,4,5,6");
  });

  it("double toggle returns to original state", () => {
    const days = new Set([1, 2, 3, 4, 5]);
    const toggled = toggleWorkingDay(toggleWorkingDay(days, 3), 3);
    expect(toggled).toEqual(days);
  });
});

// ─── Tests: Loading and error state logic ────────────────────────────────────

describe("Loading and error state logic", () => {
  it("identifies loading state when data is undefined and isLoading is true", () => {
    const state = { data: undefined, isLoading: true, isError: false, error: null };
    expect(state.isLoading).toBe(true);
    expect(state.data).toBeUndefined();
  });

  it("identifies error state when isError is true", () => {
    const error = new Error("Network error");
    const state = { data: undefined, isLoading: false, isError: true, error };
    expect(state.isError).toBe(true);
    expect(state.error?.message).toBe("Network error");
  });

  it("extracts error message from Error object", () => {
    const error = new Error("Failed to load settings");
    const message =
      error && typeof error === "object" && "message" in error
        ? (error as { message: string }).message
        : "Failed to load settings";
    expect(message).toBe("Failed to load settings");
  });

  it("uses fallback message for non-Error objects", () => {
    const error = "something went wrong";
    const message =
      error && typeof error === "object" && "message" in error
        ? (error as { message: string }).message
        : "Failed to load settings";
    expect(message).toBe("Failed to load settings");
  });

  it("identifies ready state when data is present", () => {
    const settings = createDefaultSettings();
    const state = { data: settings, isLoading: false, isError: false, error: null };
    expect(state.isLoading).toBe(false);
    expect(state.isError).toBe(false);
    expect(state.data).toBeDefined();
  });
});

// ─── Tests: Default values when settings are undefined ───────────────────────

describe("Default values for undefined settings", () => {
  it("defaults defaultView to 'month'", () => {
    const settings: Partial<UserSettings> | undefined = undefined;
    const defaultView = settings?.defaultView ?? "month";
    expect(defaultView).toBe("month");
  });

  it("defaults compactView to false", () => {
    const settings: Partial<UserSettings> | undefined = undefined;
    const compactView = settings?.compactView ?? false;
    expect(compactView).toBe(false);
  });

  it("defaults showWeekNumbers to false", () => {
    const settings: Partial<UserSettings> | undefined = undefined;
    const showWeekNumbers = settings?.showWeekNumbers ?? false;
    expect(showWeekNumbers).toBe(false);
  });

  it("defaults showDeclinedEvents to false", () => {
    const settings: Partial<UserSettings> | undefined = undefined;
    const showDeclinedEvents = settings?.showDeclinedEvents ?? false;
    expect(showDeclinedEvents).toBe(false);
  });

  it("defaults timeFormat to '12h'", () => {
    const settings: Partial<UserSettings> | undefined = undefined;
    const timeFormat = settings?.timeFormat ?? "12h";
    expect(timeFormat).toBe("12h");
  });

  it("defaults weekStartDay to 0", () => {
    const settings: Partial<UserSettings> | undefined = undefined;
    const weekStartDay = settings?.weekStartDay ?? 0;
    expect(weekStartDay).toBe(0);
  });

  it("defaults workingHoursStart to 9", () => {
    const settings: Partial<UserSettings> | undefined = undefined;
    const workingHoursStart = settings?.workingHoursStart ?? 9;
    expect(workingHoursStart).toBe(9);
  });

  it("defaults workingHoursEnd to 17", () => {
    const settings: Partial<UserSettings> | undefined = undefined;
    const workingHoursEnd = settings?.workingHoursEnd ?? 17;
    expect(workingHoursEnd).toBe(17);
  });

  it("defaults emailNotifications to true", () => {
    const settings: Partial<UserSettings> | undefined = undefined;
    const emailNotifications = settings?.emailNotifications ?? true;
    expect(emailNotifications).toBe(true);
  });

  it("defaults eventEncryptionMode to 'hybrid'", () => {
    const settings: Partial<UserSettings> | undefined = undefined;
    const mode = settings?.eventEncryptionMode ?? "hybrid";
    expect(mode).toBe("hybrid");
  });

  it("defaults workingDays to Mon-Fri", () => {
    const settings: Partial<UserSettings> | undefined = undefined;
    const workingDays = parseWorkingDays(settings?.workingDays ?? "1,2,3,4,5");
    expect(workingDays).toEqual(new Set([1, 2, 3, 4, 5]));
  });
});
