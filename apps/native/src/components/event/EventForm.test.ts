import {
  roundToNextHour,
  toLocalISOString,
  startOfDay,
  endOfDay,
  mapErrorToField,
  buildEventRequest,
  validateForm,
  REMINDER_OPTIONS,
} from "./event-form-utils";

// ─── roundToNextHour ─────────────────────────────────────────────────────────

describe("roundToNextHour", () => {
  it("rounds up when minutes are non-zero", () => {
    const d = new Date(2025, 5, 15, 9, 30, 0, 0);
    const result = roundToNextHour(d);
    expect(result.getHours()).toBe(10);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
  });

  it("does not round when already on the hour", () => {
    const d = new Date(2025, 5, 15, 9, 0, 0, 0);
    const result = roundToNextHour(d);
    expect(result.getHours()).toBe(9);
    expect(result.getMinutes()).toBe(0);
  });

  it("rounds up when only seconds are non-zero", () => {
    const d = new Date(2025, 5, 15, 9, 0, 15, 0);
    const result = roundToNextHour(d);
    expect(result.getHours()).toBe(10);
    expect(result.getMinutes()).toBe(0);
  });

  it("does not mutate the original date", () => {
    const d = new Date(2025, 5, 15, 9, 30, 0, 0);
    roundToNextHour(d);
    expect(d.getMinutes()).toBe(30);
  });
});

// ─── toLocalISOString ────────────────────────────────────────────────────────

describe("toLocalISOString", () => {
  it("formats a date as YYYY-MM-DDTHH:mm", () => {
    const d = new Date(2025, 0, 5, 9, 5);
    expect(toLocalISOString(d)).toBe("2025-01-05T09:05");
  });

  it("pads single-digit months and days", () => {
    const d = new Date(2025, 2, 3, 14, 30);
    expect(toLocalISOString(d)).toBe("2025-03-03T14:30");
  });
});

// ─── startOfDay / endOfDay ───────────────────────────────────────────────────

describe("startOfDay", () => {
  it("sets time to 00:00:00.000", () => {
    const d = new Date(2025, 5, 15, 14, 30, 45, 123);
    const result = startOfDay(d);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  it("does not mutate the original date", () => {
    const d = new Date(2025, 5, 15, 14, 30);
    startOfDay(d);
    expect(d.getHours()).toBe(14);
  });
});

describe("endOfDay", () => {
  it("sets time to 23:59:00.000", () => {
    const d = new Date(2025, 5, 15, 9, 0);
    const result = endOfDay(d);
    expect(result.getHours()).toBe(23);
    expect(result.getMinutes()).toBe(59);
    expect(result.getSeconds()).toBe(0);
  });
});

// ─── mapErrorToField ─────────────────────────────────────────────────────────

describe("mapErrorToField", () => {
  it("maps title errors to 'title'", () => {
    expect(mapErrorToField("Title is required")).toBe("title");
    expect(mapErrorToField("Title cannot exceed 255 characters")).toBe("title");
  });

  it("maps calendar errors to 'calendarId'", () => {
    expect(mapErrorToField("Calendar is required")).toBe("calendarId");
  });

  it("maps description errors to 'description'", () => {
    expect(mapErrorToField("Description cannot exceed 1000 characters")).toBe(
      "description",
    );
  });

  it("maps location errors to 'location'", () => {
    expect(mapErrorToField("Location cannot exceed 255 characters")).toBe(
      "location",
    );
  });

  it("maps end time errors to 'end'", () => {
    expect(mapErrorToField("End time must be after start time")).toBe("end");
  });

  it("maps color errors to 'color'", () => {
    expect(mapErrorToField("Color must be one of: blue, orange")).toBe("color");
  });

  it("returns null for unknown errors", () => {
    expect(mapErrorToField("Something went wrong")).toBeNull();
  });

  it("maps all known validation error patterns", () => {
    // All patterns from validateEventData in @workspace/calendar-core
    const expectations: [string, string][] = [
      ["Title is required", "title"],
      ["Title cannot exceed 255 characters", "title"],
      ["Calendar is required", "calendarId"],
      ["Description cannot exceed 1000 characters", "description"],
      ["Location cannot exceed 255 characters", "location"],
      ["End time must be after start time", "end"],
      [
        "Color must be one of: blue, orange, violet, rose, emerald, red, cyan, lime, amber, indigo, pink, teal or a valid hex color",
        "color",
      ],
    ];
    for (const [error, field] of expectations) {
      expect(mapErrorToField(error)).toBe(field);
    }
  });
});

// ─── buildEventRequest ───────────────────────────────────────────────────────

describe("buildEventRequest", () => {
  it("trims title, location, and description", () => {
    const result = buildEventRequest({
      title: "  My Event  ",
      start: "2025-06-15T09:00",
      end: "2025-06-15T10:00",
      calendarId: "cal-1",
      allDay: false,
      location: "  Office  ",
      description: "  Notes  ",
    });
    expect(result.title).toBe("My Event");
    expect(result.location).toBe("Office");
    expect(result.description).toBe("Notes");
  });

  it("omits empty optional fields", () => {
    const result = buildEventRequest({
      title: "Event",
      start: "2025-06-15T09:00",
      end: "2025-06-15T10:00",
      calendarId: "cal-1",
      allDay: false,
      location: "",
      description: "  ",
    });
    expect(result).not.toHaveProperty("location");
    expect(result).not.toHaveProperty("description");
    expect(result).not.toHaveProperty("color");
    expect(result).not.toHaveProperty("categoryId");
    expect(result).not.toHaveProperty("recurrence");
  });

  it("includes optional fields when provided", () => {
    const result = buildEventRequest({
      title: "Event",
      start: "2025-06-15T09:00",
      end: "2025-06-15T10:00",
      calendarId: "cal-1",
      allDay: true,
      location: "Home",
      description: "Desc",
      color: "blue",
      categoryId: "cat-1",
      recurrence: "FREQ=DAILY",
      reminder: 15,
    });
    expect(result.color).toBe("blue");
    expect(result.categoryId).toBe("cat-1");
    expect(result.recurrence).toBe("FREQ=DAILY");
    expect(result.reminder).toBe(15);
    expect(result.allDay).toBe(true);
  });

  it("omits reminder when zero", () => {
    const result = buildEventRequest({
      title: "Event",
      start: "2025-06-15T09:00",
      end: "2025-06-15T10:00",
      calendarId: "cal-1",
      allDay: false,
      location: "",
      description: "",
      reminder: 0,
    });
    expect(result).not.toHaveProperty("reminder");
  });

  it("includes all fields when fully populated", () => {
    const result = buildEventRequest({
      title: "  Team Standup  ",
      start: "2025-06-15T09:00",
      end: "2025-06-15T09:30",
      calendarId: "cal-work",
      allDay: false,
      location: "  Room 42  ",
      description: "  Daily sync  ",
      color: "blue",
      categoryId: "cat-meetings",
      recurrence: "FREQ=DAILY;COUNT=5",
      reminder: 10,
    });
    expect(result).toEqual({
      title: "Team Standup",
      start: "2025-06-15T09:00",
      end: "2025-06-15T09:30",
      calendarId: "cal-work",
      allDay: false,
      location: "Room 42",
      description: "Daily sync",
      color: "blue",
      categoryId: "cat-meetings",
      recurrence: "FREQ=DAILY;COUNT=5",
      reminder: 10,
    });
  });

  it("includes invited participants when provided", () => {
    const result = buildEventRequest({
      title: "Planning sync",
      start: "2025-06-15T09:00",
      end: "2025-06-15T10:00",
      calendarId: "cal-1",
      allDay: false,
      location: "",
      description: "",
      participants: [
        {
          email: "teammate@example.com",
          role: "attendee",
          status: "pending",
        },
      ],
    });

    expect(result.participants).toEqual([
      {
        email: "teammate@example.com",
        role: "attendee",
        status: "pending",
      },
    ]);
  });
});

// ─── validateForm ────────────────────────────────────────────────────────────

describe("validateForm", () => {
  it("returns no errors for valid data", () => {
    const { fieldErrors, generalErrors } = validateForm({
      title: "Meeting",
      start: "2025-06-15T09:00",
      end: "2025-06-15T10:00",
      calendarId: "cal-1",
    });
    expect(Object.keys(fieldErrors)).toHaveLength(0);
    expect(generalErrors).toHaveLength(0);
  });

  it("returns title error when title is empty", () => {
    const { fieldErrors } = validateForm({
      title: "",
      start: "2025-06-15T09:00",
      end: "2025-06-15T10:00",
      calendarId: "cal-1",
    });
    expect(fieldErrors.title).toBeDefined();
  });

  it("returns participant validation errors for invalid attendee emails", () => {
    const { fieldErrors } = validateForm({
      title: "Planning sync",
      start: "2025-06-15T09:00",
      end: "2025-06-15T10:00",
      calendarId: "cal-1",
      participants: [
        {
          email: "not-an-email",
          role: "attendee",
          status: "pending",
        },
      ],
    });

    expect(fieldErrors.participants).toBeDefined();
  });

  it("returns end error when end is before start", () => {
    const { fieldErrors } = validateForm({
      title: "Event",
      start: "2025-06-15T10:00",
      end: "2025-06-15T09:00",
      calendarId: "cal-1",
    });
    expect(fieldErrors.end).toBeDefined();
  });

  it("returns title error when title exceeds 255 chars", () => {
    const { fieldErrors } = validateForm({
      title: "A".repeat(256),
      start: "2025-06-15T09:00",
      end: "2025-06-15T10:00",
      calendarId: "cal-1",
    });
    expect(fieldErrors.title).toBeDefined();
  });

  it("returns description error when description exceeds 1000 chars", () => {
    const { fieldErrors } = validateForm({
      title: "Event",
      description: "A".repeat(1001),
      start: "2025-06-15T09:00",
      end: "2025-06-15T10:00",
      calendarId: "cal-1",
    });
    expect(fieldErrors.description).toBeDefined();
  });

  it("returns calendarId error when calendarId is empty", () => {
    const { fieldErrors } = validateForm({
      title: "Event",
      start: "2025-06-15T09:00",
      end: "2025-06-15T10:00",
      calendarId: "",
    });
    expect(fieldErrors.calendarId).toBeDefined();
  });

  it("returns title error when title is whitespace-only", () => {
    const { fieldErrors } = validateForm({
      title: "   ",
      start: "2025-06-15T09:00",
      end: "2025-06-15T10:00",
      calendarId: "cal-1",
    });
    expect(fieldErrors.title).toBeDefined();
  });

  it("passes validation with exactly 255 char title", () => {
    const { fieldErrors, generalErrors } = validateForm({
      title: "A".repeat(255),
      start: "2025-06-15T09:00",
      end: "2025-06-15T10:00",
      calendarId: "cal-1",
    });
    expect(fieldErrors.title).toBeUndefined();
    expect(generalErrors).toHaveLength(0);
  });

  it("passes validation with exactly 1000 char description", () => {
    const { fieldErrors, generalErrors } = validateForm({
      title: "Event",
      description: "B".repeat(1000),
      start: "2025-06-15T09:00",
      end: "2025-06-15T10:00",
      calendarId: "cal-1",
    });
    expect(fieldErrors.description).toBeUndefined();
    expect(generalErrors).toHaveLength(0);
  });
});

// ─── REMINDER_OPTIONS ────────────────────────────────────────────────────────

describe("REMINDER_OPTIONS", () => {
  it("contains expected values", () => {
    expect(REMINDER_OPTIONS).toEqual([0, 5, 10, 15, 30, 60]);
  });
});
