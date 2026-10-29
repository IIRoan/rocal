import { describe, expect, it } from "@jest/globals";
import type { Calendar } from "@workspace/calendar-core";

import {
  calendarFormReducer,
  initialCalendarFormState,
} from "../../components/calendar-manager/calendar-form-state";

describe("calendarFormReducer", () => {
  it("edit loads the calendar into the form and clears errors", () => {
    const calendar = {
      id: "cal-1",
      name: "Work",
      color: "red",
      isDefault: true,
    } as Calendar;
    const state = calendarFormReducer(
      { ...initialCalendarFormState, errors: { name: "Taken" } },
      { type: "edit", calendar },
    );
    expect(state).toEqual({
      ...initialCalendarFormState,
      editingCalendar: calendar,
      name: "Work",
      color: "red",
      isDefault: true,
      errors: {},
    });
  });

  it("changeName and changeColor clear only their own error", () => {
    const withErrors = {
      ...initialCalendarFormState,
      errors: { name: "Taken", color: "Invalid" },
    };
    const renamed = calendarFormReducer(withErrors, {
      type: "changeName",
      name: "Home",
    });
    expect(renamed.name).toBe("Home");
    expect(renamed.errors).toEqual({ name: undefined, color: "Invalid" });

    const recolored = calendarFormReducer(renamed, {
      type: "changeColor",
      color: "green",
    });
    expect(recolored.color).toBe("green");
    expect(recolored.errors).toEqual({ name: undefined, color: undefined });
  });

  it("toggleDefault flips the default flag", () => {
    const state = calendarFormReducer(initialCalendarFormState, {
      type: "toggleDefault",
    });
    expect(state.isDefault).toBe(true);
  });
});
