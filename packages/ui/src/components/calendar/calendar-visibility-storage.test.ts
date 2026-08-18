/** @jest-environment jsdom */

import { afterEach, describe, expect, it } from "@jest/globals";

import {
  CALENDAR_VISIBILITY_STORAGE_KEY,
  getCalendarVisibilitySnapshot,
  patchCalendarVisibility,
  subscribeCalendarVisibility,
} from "./calendar-visibility-storage";

describe("calendar visibility storage", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("reads a versioned visibility map", () => {
    localStorage.setItem(
      CALENDAR_VISIBILITY_STORAGE_KEY,
      JSON.stringify({ "cal-1": false }),
    );

    expect(getCalendarVisibilitySnapshot()).toEqual({ "cal-1": false });
  });

  it("migrates a valid legacy key to v1", () => {
    localStorage.setItem(
      "rocani-calendar-visibility",
      JSON.stringify({ "cal-2": true }),
    );

    expect(getCalendarVisibilitySnapshot()).toEqual({ "cal-2": true });
    expect(localStorage.getItem("rocani-calendar-visibility")).toBeNull();
    expect(localStorage.getItem(CALENDAR_VISIBILITY_STORAGE_KEY)).not.toBeNull();
  });

  it("patches a calendar and notifies subscribers", () => {
    let notified = 0;
    const unsubscribe = subscribeCalendarVisibility(() => {
      notified += 1;
    });

    patchCalendarVisibility("cal-3", false);

    expect(notified).toBe(1);
    expect(getCalendarVisibilitySnapshot()).toEqual({ "cal-3": false });
    unsubscribe();
  });
});
