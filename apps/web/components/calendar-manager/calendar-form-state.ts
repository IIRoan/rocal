import type { Dispatch } from "react";
import type { Calendar } from "@workspace/calendar-core";

export type CalendarFormErrors = { name?: string; color?: string };

export type CalendarFormState = {
  name: string;
  color: string;
  isDefault: boolean;
  saving: boolean;
  editingCalendar: Calendar | null;
  errors: CalendarFormErrors;
};

export type CalendarFormAction =
  | { type: "set"; patch: Partial<CalendarFormState> }
  | { type: "edit"; calendar: Calendar }
  | { type: "changeName"; name: string }
  | { type: "changeColor"; color: string }
  | { type: "toggleDefault" };

export const initialCalendarFormState: CalendarFormState = {
  name: "",
  color: "blue",
  isDefault: false,
  saving: false,
  editingCalendar: null,
  errors: {},
};

export function calendarFormReducer(
  state: CalendarFormState,
  action: CalendarFormAction,
): CalendarFormState {
  switch (action.type) {
    case "set":
      return { ...state, ...action.patch };
    case "edit":
      return {
        ...state,
        editingCalendar: action.calendar,
        name: action.calendar.name,
        color: action.calendar.color,
        isDefault: action.calendar.isDefault || false,
        errors: {},
      };
    case "changeName":
      return {
        ...state,
        name: action.name,
        errors: state.errors.name
          ? { ...state.errors, name: undefined }
          : state.errors,
      };
    case "changeColor":
      return {
        ...state,
        color: action.color,
        errors: state.errors.color
          ? { ...state.errors, color: undefined }
          : state.errors,
      };
    case "toggleDefault":
      return { ...state, isDefault: !state.isDefault };
    default:
      return state;
  }
}

/** Setter callbacks in the shape the `command-palette/calendar-utils` handlers expect. */
export function calendarFormSetters(dispatch: Dispatch<CalendarFormAction>) {
  const set = (patch: Partial<CalendarFormState>) =>
    dispatch({ type: "set", patch });
  return {
    setCalendarName: (name: string) => set({ name }),
    setCalendarColor: (color: string) => set({ color }),
    setCalendarIsDefault: (isDefault: boolean) => set({ isDefault }),
    setCalendarSaving: (saving: boolean) => set({ saving }),
    setEditingCalendar: (editingCalendar: Calendar | null) =>
      set({ editingCalendar }),
    setCalendarValidationErrors: (errors: CalendarFormErrors) =>
      set({ errors }),
  };
}
