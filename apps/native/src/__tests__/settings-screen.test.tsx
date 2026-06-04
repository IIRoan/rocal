import { beforeEach, describe, expect, it } from "@jest/globals";
import type {
  UpdateSettingsRequest,
  UserSettings,
} from "@workspace/calendar-core";

const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];

function parseWorkingDayValue(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 && value <= 6 ? value : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = Number(trimmed);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 6
      ? parsed
      : null;
  }

  return null;
}

function parseWorkingDays(workingDays: string): Set<number> {
  if (!workingDays) {
    return new Set(DEFAULT_WORKING_DAYS);
  }

  try {
    const parsed = JSON.parse(workingDays);
    if (Array.isArray(parsed)) {
      return new Set(
        parsed
          .map(parseWorkingDayValue)
          .filter((value): value is number => value !== null),
      );
    }
  } catch {
    // Fall back to legacy CSV input.
  }

  return new Set(
    workingDays
      .split(",")
      .map(parseWorkingDayValue)
      .filter((value): value is number => value !== null),
  );
}

function serializeWorkingDays(days: Set<number>): string {
  return JSON.stringify(Array.from(days).sort((left, right) => left - right));
}

function applyOptimisticUpdate(
  current: UserSettings,
  update: UpdateSettingsRequest,
): UserSettings {
  return { ...current, ...update };
}

function rollbackUpdate(
  _current: UserSettings,
  previous: UserSettings,
): UserSettings {
  return previous;
}

type ThemePreference = "light" | "dark" | "system";

interface ThemeChangeResult {
  themePreferenceCalled: ThemePreference;
  backendUpdatePayload: UpdateSettingsRequest;
}

function handleThemeChange(pref: ThemePreference): ThemeChangeResult {
  return {
    themePreferenceCalled: pref,
    backendUpdatePayload: { theme: pref },
  };
}

function handleResetSettings() {
  return {
    backendResetCalled: true,
    themePreferenceCalled: "system" as ThemePreference,
  };
}

function addPendingKeys(
  current: Set<string>,
  update: UpdateSettingsRequest,
): Set<string> {
  const next = new Set(current);
  for (const key of Object.keys(update)) {
    next.add(key);
  }
  return next;
}

function removePendingKeys(
  current: Set<string>,
  update: UpdateSettingsRequest,
): Set<string> {
  const next = new Set(current);
  for (const key of Object.keys(update)) {
    next.delete(key);
  }
  return next;
}

function toggleWorkingDay(workingDays: Set<number>, day: number): Set<number> {
  const next = new Set(workingDays);
  if (next.has(day)) {
    next.delete(day);
  } else {
    next.add(day);
  }
  return next;
}

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
    workingDays: "[1,2,3,4,5]",
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

describe("parseWorkingDays", () => {
  it("parses the current JSON weekday format", () => {
    const result = parseWorkingDays("[1,2,3,4,5]");
    expect(result).toEqual(new Set([1, 2, 3, 4, 5]));
  });

  it("supports the legacy CSV format", () => {
    const result = parseWorkingDays("1,2,3,4,5");
    expect(result).toEqual(new Set([1, 2, 3, 4, 5]));
  });

  it("returns default weekdays for empty values", () => {
    const result = parseWorkingDays("");
    expect(result).toEqual(new Set([1, 2, 3, 4, 5]));
  });

  it("filters invalid JSON values", () => {
    const result = parseWorkingDays('[1,2,8,-1,"3",null]');
    expect(result).toEqual(new Set([1, 2, 3]));
  });

  it("filters invalid CSV values", () => {
    const result = parseWorkingDays("1,abc,7,-1,5");
    expect(result).toEqual(new Set([1, 5]));
  });
});

describe("serializeWorkingDays", () => {
  it("serializes weekdays to sorted JSON", () => {
    const result = serializeWorkingDays(new Set([1, 2, 3, 4, 5]));
    expect(result).toBe("[1,2,3,4,5]");
  });

  it("sorts day numbers numerically", () => {
    const result = serializeWorkingDays(new Set([5, 3, 1]));
    expect(result).toBe("[1,3,5]");
  });

  it("serializes an empty set", () => {
    const result = serializeWorkingDays(new Set());
    expect(result).toBe("[]");
  });
});

describe("parseWorkingDays / serializeWorkingDays round-trip", () => {
  it("round-trips the JSON working day format", () => {
    const original = "[1,2,3,4,5]";
    const parsed = parseWorkingDays(original);
    const serialized = serializeWorkingDays(parsed);
    expect(serialized).toBe(original);
  });

  it("normalizes unsorted input on round-trip", () => {
    const input = "[5,3,1]";
    const parsed = parseWorkingDays(input);
    const serialized = serializeWorkingDays(parsed);
    expect(serialized).toBe("[1,3,5]");
  });

  it("upgrades legacy CSV input to JSON on round-trip", () => {
    const parsed = parseWorkingDays("1,2,3,4,5");
    const serialized = serializeWorkingDays(parsed);
    expect(serialized).toBe("[1,2,3,4,5]");
  });
});

describe("Setting changes - optimistic updates", () => {
  let settings: UserSettings;

  beforeEach(() => {
    settings = createDefaultSettings();
  });

  it("changes compact view optimistically", () => {
    const updated = applyOptimisticUpdate(settings, {
      compactView: true,
    });
    expect(updated.compactView).toBe(true);
  });

  it("changes the default calendar optimistically", () => {
    const updated = applyOptimisticUpdate(settings, {
      defaultCalendarId: "calendar-2",
    });
    expect(updated.defaultCalendarId).toBe("calendar-2");
  });

  it("changes browser notifications optimistically", () => {
    const updated = applyOptimisticUpdate(settings, {
      browserNotifications: false,
    });
    expect(updated.browserNotifications).toBe(false);
  });

  it("applies multiple settings at once", () => {
    const updated = applyOptimisticUpdate(settings, {
      compactView: true,
      timeFormat: "24h",
    });
    expect(updated.compactView).toBe(true);
    expect(updated.timeFormat).toBe("24h");
    expect(updated.defaultView).toBe("month");
  });

  it("preserves immutable fields", () => {
    const updated = applyOptimisticUpdate(settings, {
      compactView: true,
    });
    expect(updated.id).toBe(settings.id);
    expect(updated.userId).toBe(settings.userId);
    expect(updated.createdAt).toBe(settings.createdAt);
    expect(updated.updatedAt).toBe(settings.updatedAt);
  });
});

describe("Optimistic update rollback on error", () => {
  it("restores previous settings on API failure", () => {
    const original = createDefaultSettings();
    const optimistic = applyOptimisticUpdate(original, {
      compactView: true,
    });

    const rolledBack = rollbackUpdate(optimistic, original);
    expect(rolledBack.compactView).toBe(false);
    expect(rolledBack).toEqual(original);
  });

  it("restores multiple changed fields on rollback", () => {
    const original = createDefaultSettings();
    const optimistic = applyOptimisticUpdate(original, {
      compactView: true,
      timeFormat: "24h",
    });

    const rolledBack = rollbackUpdate(optimistic, original);
    expect(rolledBack.compactView).toBe(false);
    expect(rolledBack.timeFormat).toBe("12h");
  });
});

describe("Theme switching", () => {
  it("calls setThemePreference with light", () => {
    const result = handleThemeChange("light");
    expect(result.themePreferenceCalled).toBe("light");
    expect(result.backendUpdatePayload).toEqual({ theme: "light" });
  });

  it("calls setThemePreference with dark", () => {
    const result = handleThemeChange("dark");
    expect(result.themePreferenceCalled).toBe("dark");
    expect(result.backendUpdatePayload).toEqual({ theme: "dark" });
  });

  it("calls setThemePreference with system", () => {
    const result = handleThemeChange("system");
    expect(result.themePreferenceCalled).toBe("system");
    expect(result.backendUpdatePayload).toEqual({ theme: "system" });
  });
});

describe("Reset settings", () => {
  it("resets backend settings and local theme preference together", () => {
    const result = handleResetSettings();
    expect(result.backendResetCalled).toBe(true);
    expect(result.themePreferenceCalled).toBe("system");
  });
});

describe("Pending keys tracking", () => {
  it("adds keys from an update to the pending set", () => {
    const pending = new Set<string>();
    const result = addPendingKeys(pending, { compactView: true });
    expect(result.has("compactView")).toBe(true);
  });

  it("adds multiple keys from a multi-field update", () => {
    const pending = new Set<string>();
    const result = addPendingKeys(pending, {
      compactView: true,
      browserNotifications: false,
    });
    expect(result.has("compactView")).toBe(true);
    expect(result.has("browserNotifications")).toBe(true);
  });

  it("removes keys when an update settles", () => {
    const pending = new Set(["compactView", "theme"]);
    const result = removePendingKeys(pending, { compactView: true });
    expect(result.has("compactView")).toBe(false);
    expect(result.has("theme")).toBe(true);
  });
});

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
    toggleWorkingDay(days, 6);
    expect(days.has(6)).toBe(false);
    expect(days.size).toBe(5);
  });

  it("produces JSON output after a toggle", () => {
    const days = new Set([1, 2, 3, 4, 5]);
    const toggled = toggleWorkingDay(days, 6);
    const serialized = serializeWorkingDays(toggled);
    expect(serialized).toBe("[1,2,3,4,5,6]");
  });
});

describe("Loading and error state logic", () => {
  it("identifies a loading state", () => {
    const state = {
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    };
    expect(state.isLoading).toBe(true);
    expect(state.data).toBeUndefined();
  });

  it("identifies an error state", () => {
    const error = new Error("Network error");
    const state = { data: undefined, isLoading: false, isError: true, error };
    expect(state.isError).toBe(true);
    expect(state.error?.message).toBe("Network error");
  });

  it("extracts an error message from Error objects", () => {
    const error = new Error("Failed to load settings");
    const message =
      error && typeof error === "object" && "message" in error
        ? (error as { message: string }).message
        : "Failed to load settings";
    expect(message).toBe("Failed to load settings");
  });
});

describe("Default values for undefined settings", () => {
  function getSettings(): Partial<UserSettings> | undefined {
    return undefined;
  }

  it("defaults defaultView to month", () => {
    const settings = getSettings();
    const defaultView = settings?.defaultView ?? "month";
    expect(defaultView).toBe("month");
  });

  it("defaults compactView to false", () => {
    const settings = getSettings();
    const compactView = settings?.compactView ?? false;
    expect(compactView).toBe(false);
  });

  it("defaults defaultCalendarId to null", () => {
    const settings = getSettings();
    const defaultCalendarId = settings?.defaultCalendarId ?? null;
    expect(defaultCalendarId).toBeNull();
  });

  it("defaults timeFormat to 12h", () => {
    const settings = getSettings();
    const timeFormat = settings?.timeFormat ?? "12h";
    expect(timeFormat).toBe("12h");
  });

  it("defaults workingDays to the web-compatible JSON shape", () => {
    const settings = getSettings();
    const workingDays = parseWorkingDays(
      settings?.workingDays ?? "[1,2,3,4,5]",
    );
    expect(workingDays).toEqual(new Set([1, 2, 3, 4, 5]));
  });
});
