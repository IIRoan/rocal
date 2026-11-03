import { toast } from "@workspace/ui/lib/toast";
import { createLogger } from "@workspace/logger";
import {
  getErrorMessage,
  type Calendar,
  type CreateCalendarRequest,
  type UpdateCalendarRequest,
} from "@workspace/calendar-core";
import type { UseCalendarDataReturn } from "@/hooks/use-calendar-data";
import { PRESET_COLORS } from "./navigation-config";

const log = createLogger("calendar-utils");

const ALLOWED_COLOR_VALUES = PRESET_COLORS.map((c) => c.value);

type CalendarValidationErrors = { name?: string; color?: string };

type CalendarData = Pick<
  UseCalendarDataReturn,
  "createCalendar" | "updateCalendar" | "deleteCalendar"
>;

export const validateCalendarForm = (
  calendarName: string,
  calendarColor: string,
  calendars: Calendar[],
  editingCalendar?: Calendar | null,
) => {
  const errors: { name?: string; color?: string } = {};

  // Check if name is empty
  if (!calendarName.trim()) {
    errors.name = "Calendar name is required";
  }

  // Check name length
  if (calendarName.trim().length > 100) {
    errors.name = "Calendar name cannot exceed 100 characters";
  }

  // Check for duplicate names (case-insensitive)
  const normalizedCalendarName = calendarName.trim().toLowerCase();
  const nameExists = calendars.some(
    (cal) =>
      (!editingCalendar || cal.id !== editingCalendar.id) &&
      cal.name.toLowerCase() === normalizedCalendarName,
  );

  if (nameExists) {
    errors.name = "A calendar with this name already exists. Choose another name.";
  }

  // Validate color format (named colors or hex)
  const isHexColor = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(calendarColor);
  if (!isHexColor && !ALLOWED_COLOR_VALUES.includes(calendarColor)) {
    errors.color = "Choose one of the preset colors";
  }

  return errors;
};

export const handleCalendarCreate = async (
  calendarName: string,
  calendarColor: string,
  calendarIsDefault: boolean,
  calendars: Calendar[],
  calendarData: Pick<CalendarData, "createCalendar">,
  setters: {
    setCalendarValidationErrors: (errors: CalendarValidationErrors) => void;
    setCalendarSaving: (saving: boolean) => void;
    setCalendarName: (name: string) => void;
    setCalendarColor: (color: string) => void;
    setCalendarIsDefault: (isDefault: boolean) => void;
  },
  goBack: () => void,
) => {
  setters.setCalendarValidationErrors({});

  const errors = validateCalendarForm(calendarName, calendarColor, calendars);
  if (Object.keys(errors).length > 0) {
    setters.setCalendarValidationErrors(errors);
    return;
  }

  setters.setCalendarSaving(true);
  try {
    await calendarData.createCalendar({
      name: calendarName.trim(),
      color: calendarColor,
      isDefault: calendarIsDefault,
    });

    toast.success(`Calendar "${calendarName}" created`);
    setters.setCalendarName("");
    setters.setCalendarColor("blue");
    setters.setCalendarIsDefault(false);
    setters.setCalendarValidationErrors({});
    goBack();
  } catch (error: unknown) {
    log.error("Failed to create calendar:", error);
    if (getErrorMessage(error, "").includes("already exists")) {
      setters.setCalendarValidationErrors({
        name: "A calendar with this name already exists. Choose another name.",
      });
    } else {
      toast.error(
        "Calendar not created. Check your connection and try again.",
      );
    }
  } finally {
    setters.setCalendarSaving(false);
  }
};

export const handleCalendarUpdate = async (
  calendarName: string,
  calendarColor: string,
  calendarIsDefault: boolean,
  calendars: Calendar[],
  editingCalendar: Calendar | null,
  calendarData: Pick<CalendarData, "updateCalendar">,
  setters: {
    setCalendarValidationErrors: (errors: CalendarValidationErrors) => void;
    setCalendarSaving: (saving: boolean) => void;
    setEditingCalendar: (calendar: Calendar | null) => void;
  },
  goBack: () => void,
) => {
  if (!editingCalendar) return;

  setters.setCalendarValidationErrors({});

  const errors = validateCalendarForm(
    calendarName,
    calendarColor,
    calendars,
    editingCalendar,
  );
  if (Object.keys(errors).length > 0) {
    setters.setCalendarValidationErrors(errors);
    return;
  }

  setters.setCalendarSaving(true);
  try {
    const payload = {
      name: calendarName.trim(),
      color: calendarColor,
      isDefault: calendarIsDefault,
    };
    await calendarData.updateCalendar(editingCalendar.id, payload);

    toast.success(`Calendar "${calendarName}" updated`);
    setters.setEditingCalendar(null);
    goBack();
  } catch (error: unknown) {
    log.error("Failed to update calendar:", error);
    const message = getErrorMessage(error, "");
    if (message.includes("already exists")) {
      setters.setCalendarValidationErrors({
        name: "A calendar with this name already exists. Choose another name.",
      });
    } else if (message.includes("Color must be")) {
      setters.setCalendarValidationErrors({
        color: "Choose one of the preset colors",
      });
    } else {
      toast.error(
        "Calendar not updated. Check your connection and try again.",
      );
    }
  } finally {
    setters.setCalendarSaving(false);
  }
};

export const handleCalendarDelete = async (
  calendar: Calendar,
  calendarData: Pick<CalendarData, "deleteCalendar">,
  setCalendarSaving: (saving: boolean) => void,
  goBack: () => void,
) => {
  setCalendarSaving(true);
  try {
    // "delete_events" is the advanced delete action that also removes every event in the calendar.
    await calendarData.deleteCalendar(calendar.id, "delete_events");
    toast.success(`Calendar "${calendar.name}" deleted`);
    goBack();
  } catch (error: unknown) {
    log.error("Failed to delete calendar:", error);
    toast.error(
      "Calendar not deleted. Check your connection and try again.",
    );
  } finally {
    setCalendarSaving(false);
  }
};

export const resetCalendarForm = (setters: {
  setCalendarName: (name: string) => void;
  setCalendarColor: (color: string) => void;
  setCalendarIsDefault: (isDefault: boolean) => void;
  setEditingCalendar: (calendar: Calendar | null) => void;
  setCalendarValidationErrors: (errors: CalendarValidationErrors) => void;
}) => {
  setters.setCalendarName("");
  setters.setCalendarColor("blue");
  setters.setCalendarIsDefault(false);
  setters.setEditingCalendar(null);
  setters.setCalendarValidationErrors({});
};
