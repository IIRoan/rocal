import { toast } from "sonner";
import { createLogger } from "@workspace/logger";
import { PRESET_COLORS } from "./navigation-config";

const log = createLogger("calendar-utils");

const ALLOWED_COLOR_VALUES = PRESET_COLORS.map((c) => c.value);

export const validateCalendarForm = (
  calendarName: string,
  calendarColor: string,
  calendars: any[],
  editingCalendar?: any,
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
  const existingNames = calendars
    .filter((cal) => (editingCalendar ? cal.id !== editingCalendar.id : true))
    .map((cal) => cal.name.toLowerCase());

  if (existingNames.includes(calendarName.trim().toLowerCase())) {
    errors.name = "A calendar with this name already exists";
  }

  // Validate color format (named colors or hex)
  const isHexColor = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(calendarColor);
  if (!isHexColor && !ALLOWED_COLOR_VALUES.includes(calendarColor)) {
    errors.color = "Please select a valid color";
  }

  return errors;
};

export const handleCalendarCreate = async (
  calendarName: string,
  calendarColor: string,
  calendarIsDefault: boolean,
  calendars: any[],
  calendarData: any,
  setters: {
    setCalendarValidationErrors: (errors: any) => void;
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
  } catch (error: any) {
    log.error("Failed to create calendar:", error);
    if (error.message && error.message.includes("already exists")) {
      setters.setCalendarValidationErrors({
        name: "A calendar with this name already exists",
      });
    } else {
      toast.error("Failed to create calendar");
    }
  } finally {
    setters.setCalendarSaving(false);
  }
};

export const handleCalendarUpdate = async (
  calendarName: string,
  calendarColor: string,
  calendarIsDefault: boolean,
  calendars: any[],
  editingCalendar: any,
  calendarData: any,
  setters: {
    setCalendarValidationErrors: (errors: any) => void;
    setCalendarSaving: (saving: boolean) => void;
    setEditingCalendar: (calendar: any) => void;
  },
  goBack: () => void,
  options: { forceFullEncryption?: boolean } = {},
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
    const payload: {
      name: string;
      color: string;
      isDefault: boolean;
      forceFullEncryption?: boolean;
    } = {
      name: calendarName.trim(),
      color: calendarColor,
      isDefault: calendarIsDefault,
    };
    if (options.forceFullEncryption !== undefined) {
      payload.forceFullEncryption = options.forceFullEncryption;
    }
    await calendarData.updateCalendar(editingCalendar.id, payload);

    toast.success(`Calendar "${calendarName}" updated`);
    setters.setEditingCalendar(null);
    goBack();
  } catch (error: any) {
    log.error("Failed to update calendar:", error);
    if (error.message && error.message.includes("already exists")) {
      setters.setCalendarValidationErrors({
        name: "A calendar with this name already exists",
      });
    } else if (error.message && error.message.includes("Color must be")) {
      setters.setCalendarValidationErrors({
        color: "Please select a valid color",
      });
    } else {
      toast.error("Failed to update calendar");
    }
  } finally {
    setters.setCalendarSaving(false);
  }
};

export const handleCalendarDelete = async (
  calendar: any,
  calendarData: any,
  setCalendarSaving: (saving: boolean) => void,
  goBack: () => void,
) => {
  setCalendarSaving(true);
  try {
    // Use deleteCalendarAdvanced to properly handle associated events
    // Default action is "delete_events" which will remove all events in the calendar
    await calendarData.deleteCalendar(calendar.id, "delete_events");
    toast.success(`Calendar "${calendar.name}" deleted`);
    goBack();
  } catch (error: any) {
    log.error("Failed to delete calendar:", error);
    toast.error("Failed to delete calendar");
  } finally {
    setCalendarSaving(false);
  }
};

export const resetCalendarForm = (setters: {
  setCalendarName: (name: string) => void;
  setCalendarColor: (color: string) => void;
  setCalendarIsDefault: (isDefault: boolean) => void;
  setEditingCalendar: (calendar: any) => void;
  setCalendarValidationErrors: (errors: any) => void;
}) => {
  setters.setCalendarName("");
  setters.setCalendarColor("blue");
  setters.setCalendarIsDefault(false);
  setters.setEditingCalendar(null);
  setters.setCalendarValidationErrors({});
};
