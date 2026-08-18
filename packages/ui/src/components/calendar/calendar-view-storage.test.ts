/** @jest-environment jsdom */

import { afterEach, describe, expect, it } from "@jest/globals";

import {
  CALENDAR_VIEW_STORAGE_KEY,
  getStoredCalendarViewSnapshot,
  readStoredCalendarView,
  subscribeStoredCalendarView,
  writeStoredCalendarView,
} from "./calendar-view-storage";

describe("calendar view storage", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("reads a versioned view and ignores expired payloads", () => {
    sessionStorage.setItem(
      CALENDAR_VIEW_STORAGE_KEY,
      JSON.stringify({ view: "week", expires: Date.now() + 60_000 }),
    );

    expect(readStoredCalendarView()).toBe("week");

    sessionStorage.setItem(
      CALENDAR_VIEW_STORAGE_KEY,
      JSON.stringify({ view: "day", expires: Date.now() - 1 }),
    );

    expect(readStoredCalendarView()).toBeNull();
  });

  it("migrates a valid legacy key to v1", () => {
    sessionStorage.setItem(
      "calendar-view-selection",
      JSON.stringify({ view: "3day", expires: Date.now() + 60_000 }),
    );

    expect(readStoredCalendarView()).toBe("3day");
    expect(sessionStorage.getItem("calendar-view-selection")).toBeNull();
    expect(sessionStorage.getItem(CALENDAR_VIEW_STORAGE_KEY)).not.toBeNull();
  });

  it("writes a versioned key", () => {
    writeStoredCalendarView("agenda");

    const stored = JSON.parse(
      sessionStorage.getItem(CALENDAR_VIEW_STORAGE_KEY) ?? "null",
    ) as { view?: string; expires?: number };

    expect(stored.view).toBe("agenda");
    expect(typeof stored.expires).toBe("number");
    expect(stored.expires).toBeGreaterThan(Date.now());
  });

  it("notifies subscribers and updates the snapshot", () => {
    let notified = 0;
    const unsubscribe = subscribeStoredCalendarView(() => {
      notified += 1;
    });

    writeStoredCalendarView("week");

    expect(notified).toBe(1);
    expect(getStoredCalendarViewSnapshot("month")).toBe("week");
    unsubscribe();
  });
});
