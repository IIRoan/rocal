import { toast } from "sonner";
export const validateCalendarForm = (calendarName, calendarColor, calendars, editingCalendar) => {
    const errors = {};
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
        .filter((cal) => editingCalendar ? cal.id !== editingCalendar.id : true)
        .map((cal) => cal.name.toLowerCase());
    if (existingNames.includes(calendarName.trim().toLowerCase())) {
        errors.name = "A calendar with this name already exists";
    }
    // Validate color format (basic hex validation)
    const isHexColor = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(calendarColor);
    if (!isHexColor) {
        errors.color = "Please select a valid color";
    }
    return errors;
};
export const handleCalendarCreate = async (calendarName, calendarColor, calendars, calendarData, setters, goBack) => {
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
            isDefault: false,
        });
        toast.success(`Calendar "${calendarName}" created`);
        setters.setCalendarName("");
        setters.setCalendarColor("#3b82f6");
        goBack("calendars");
    }
    catch (error) {
        console.error("Failed to create calendar:", error);
        if (error.message && error.message.includes("already exists")) {
            setters.setCalendarValidationErrors({
                name: "A calendar with this name already exists",
            });
        }
        else {
            toast.error("Failed to create calendar");
        }
    }
    finally {
        setters.setCalendarSaving(false);
    }
};
export const handleCalendarUpdate = async (calendarName, calendarColor, calendars, editingCalendar, calendarData, setters, goBack) => {
    if (!editingCalendar)
        return;
    setters.setCalendarValidationErrors({});
    // Validate only if name changed
    if (calendarName !== editingCalendar.name) {
        const existingNames = calendars
            .filter((cal) => cal.id !== editingCalendar.id)
            .map((cal) => cal.name.toLowerCase());
        if (!calendarName.trim()) {
            setters.setCalendarValidationErrors({ name: "Calendar name is required" });
            return;
        }
        if (calendarName.trim().length > 100) {
            setters.setCalendarValidationErrors({
                name: "Calendar name cannot exceed 100 characters",
            });
            return;
        }
        if (existingNames.includes(calendarName.trim().toLowerCase())) {
            setters.setCalendarValidationErrors({
                name: "A calendar with this name already exists",
            });
            return;
        }
    }
    setters.setCalendarSaving(true);
    try {
        await calendarData.updateCalendar(editingCalendar.id, {
            name: calendarName.trim(),
            color: calendarColor,
        });
        toast.success(`Calendar "${calendarName}" updated`);
        setters.setEditingCalendar(null);
        goBack("calendars");
    }
    catch (error) {
        console.error("Failed to update calendar:", error);
        if (error.message && error.message.includes("already exists")) {
            setters.setCalendarValidationErrors({
                name: "A calendar with this name already exists",
            });
        }
        else {
            toast.error("Failed to update calendar");
        }
    }
    finally {
        setters.setCalendarSaving(false);
    }
};
export const handleCalendarDelete = async (calendar, calendarData, setCalendarSaving, goBack) => {
    setCalendarSaving(true);
    try {
        await calendarData.deleteCalendar(calendar.id);
        toast.success(`Calendar "${calendar.name}" deleted`);
        goBack("calendars");
    }
    catch (error) {
        console.error("Failed to delete calendar:", error);
        toast.error("Failed to delete calendar");
    }
    finally {
        setCalendarSaving(false);
    }
};
export const resetCalendarForm = (setters) => {
    setters.setCalendarName("");
    setters.setCalendarColor("#3b82f6");
    setters.setEditingCalendar(null);
    setters.setCalendarValidationErrors({});
};
