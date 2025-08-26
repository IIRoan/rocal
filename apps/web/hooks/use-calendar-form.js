"use client";
import { useState, useCallback } from "react";
import { toast } from "sonner";
import { validateCalendarForm } from "@/components/command-palette/calendar-utils";
export function useCalendarForm({ calendars, calendarData, onSuccess, }) {
    const [calendarName, setCalendarName] = useState("");
    const [calendarColor, setCalendarColor] = useState("#3b82f6");
    const [editingCalendar, setEditingCalendar] = useState(null);
    const [validationErrors, setValidationErrors] = useState({});
    const [saving, setSaving] = useState(false);
    // Reset form to initial state
    const resetForm = useCallback(() => {
        setCalendarName("");
        setCalendarColor("#3b82f6");
        setEditingCalendar(null);
        setValidationErrors({});
    }, []);
    // Validate the form
    const validateForm = useCallback(() => {
        const errors = validateCalendarForm(calendarName, calendarColor, calendars, editingCalendar);
        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    }, [calendarName, calendarColor, calendars, editingCalendar]);
    // Create calendar
    const createCalendar = useCallback(async () => {
        if (!validateForm())
            return;
        setSaving(true);
        try {
            const newCalendar = await calendarData.createCalendar({
                name: calendarName.trim(),
                color: calendarColor,
                isDefault: false,
            });
            toast.success(`Calendar "${calendarName}" created`);
            resetForm();
            onSuccess?.('create', newCalendar);
        }
        catch (error) {
            console.error("Failed to create calendar:", error);
            if (error.message && error.message.includes("already exists")) {
                setValidationErrors({
                    name: "A calendar with this name already exists",
                });
            }
            else {
                toast.error("Failed to create calendar");
            }
        }
        finally {
            setSaving(false);
        }
    }, [calendarName, calendarColor, calendarData, validateForm, resetForm, onSuccess]);
    // Update calendar
    const updateCalendar = useCallback(async () => {
        if (!editingCalendar || !validateForm())
            return;
        setSaving(true);
        try {
            const updatedCalendar = await calendarData.updateCalendar(editingCalendar.id, {
                name: calendarName.trim(),
                color: calendarColor,
            });
            toast.success(`Calendar "${calendarName}" updated`);
            resetForm();
            onSuccess?.('update', updatedCalendar);
        }
        catch (error) {
            console.error("Failed to update calendar:", error);
            if (error.message && error.message.includes("already exists")) {
                setValidationErrors({
                    name: "A calendar with this name already exists",
                });
            }
            else {
                toast.error("Failed to update calendar");
            }
        }
        finally {
            setSaving(false);
        }
    }, [editingCalendar, calendarName, calendarColor, calendarData, validateForm, resetForm, onSuccess]);
    // Delete calendar
    const deleteCalendar = useCallback(async (calendar) => {
        setSaving(true);
        try {
            await calendarData.deleteCalendar(calendar.id);
            toast.success(`Calendar "${calendar.name}" deleted`);
            onSuccess?.('delete', calendar);
        }
        catch (error) {
            console.error("Failed to delete calendar:", error);
            toast.error("Failed to delete calendar");
        }
        finally {
            setSaving(false);
        }
    }, [calendarData, onSuccess]);
    // Start editing a calendar
    const startEdit = useCallback((calendar) => {
        setEditingCalendar(calendar);
        setCalendarName(calendar.name);
        setCalendarColor(calendar.color);
        setValidationErrors({});
    }, []);
    // Cancel editing
    const cancelEdit = useCallback(() => {
        resetForm();
    }, [resetForm]);
    return {
        // Form state
        calendarName,
        calendarColor,
        editingCalendar,
        validationErrors,
        saving,
        // Actions
        setCalendarName,
        setCalendarColor,
        setEditingCalendar,
        setValidationErrors,
        setSaving,
        // Form operations
        resetForm,
        validateForm,
        createCalendar,
        updateCalendar,
        deleteCalendar,
        startEdit,
        cancelEdit,
    };
}
export function useColorSelector({ initialColor = "#3b82f6", onColorChange, presetColors = [
    "#ef4444", // red
    "#f97316", // orange
    "#f59e0b", // amber
    "#eab308", // yellow
    "#84cc16", // lime
    "#22c55e", // green
    "#10b981", // emerald
    "#06b6d4", // cyan
    "#3b82f6", // blue
    "#6366f1", // indigo
    "#8b5cf6", // violet
    "#a855f7", // purple
    "#d946ef", // fuchsia
    "#ec4899", // pink
    "#f43f5e", // rose
    "#64748b", // slate
], } = {}) {
    const [selectedColor, setSelectedColorState] = useState(initialColor);
    const setSelectedColor = useCallback((color) => {
        setSelectedColorState(color);
        onColorChange?.(color);
    }, [onColorChange]);
    const isPresetColor = useCallback((color) => {
        return presetColors.includes(color);
    }, [presetColors]);
    return {
        selectedColor,
        setSelectedColor,
        isPresetColor,
        presetColors,
    };
}
