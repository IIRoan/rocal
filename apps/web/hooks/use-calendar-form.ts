"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import {
  validateCalendarForm,
  handleCalendarCreate,
  handleCalendarUpdate,
  handleCalendarDelete,
  resetCalendarForm,
} from "@/components/command-palette/calendar-utils";
import type { Calendar } from "@workspace/ui/components/calendar/types";

interface UseCalendarFormProps {
  calendars: Calendar[];
  calendarData: any;
  onSuccess?: (
    action: "create" | "update" | "delete",
    calendar?: Calendar,
  ) => void;
}

interface CalendarFormErrors {
  name?: string;
  color?: string;
}

interface UseCalendarFormReturn {
  // Form state
  calendarName: string;
  calendarColor: string;
  editingCalendar: Calendar | null;
  validationErrors: CalendarFormErrors;
  saving: boolean;

  // Actions
  setCalendarName: (name: string) => void;
  setCalendarColor: (color: string) => void;
  setEditingCalendar: (calendar: Calendar | null) => void;
  setValidationErrors: (errors: CalendarFormErrors) => void;
  setSaving: (saving: boolean) => void;

  // Form operations
  resetForm: () => void;
  validateForm: () => boolean;
  createCalendar: () => Promise<void>;
  updateCalendar: () => Promise<void>;
  deleteCalendar: (calendar: Calendar) => Promise<void>;
  startEdit: (calendar: Calendar) => void;
  cancelEdit: () => void;
}

export function useCalendarForm({
  calendars,
  calendarData,
  onSuccess,
}: UseCalendarFormProps): UseCalendarFormReturn {
  const [calendarName, setCalendarName] = useState("");
  const [calendarColor, setCalendarColor] = useState("#3b82f6");
  const [editingCalendar, setEditingCalendar] = useState<Calendar | null>(null);
  const [validationErrors, setValidationErrors] = useState<CalendarFormErrors>(
    {},
  );
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
    const errors = validateCalendarForm(
      calendarName,
      calendarColor,
      calendars,
      editingCalendar,
    );
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [calendarName, calendarColor, calendars, editingCalendar]);

  // Create calendar
  const createCalendar = useCallback(async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      const newCalendar = await calendarData.createCalendar({
        name: calendarName.trim(),
        color: calendarColor,
        isDefault: false,
      });

      toast.success(`Calendar "${calendarName}" created`);
      resetForm();
      onSuccess?.("create", newCalendar);
    } catch (error: any) {
      console.error("Failed to create calendar:", error);
      if (error.message && error.message.includes("already exists")) {
        setValidationErrors({
          name: "A calendar with this name already exists",
        });
      } else {
        toast.error("Failed to create calendar");
      }
    } finally {
      setSaving(false);
    }
  }, [
    calendarName,
    calendarColor,
    calendarData,
    validateForm,
    resetForm,
    onSuccess,
  ]);

  // Update calendar
  const updateCalendar = useCallback(async () => {
    if (!editingCalendar || !validateForm()) return;

    setSaving(true);
    try {
      const updatedCalendar = await calendarData.updateCalendar(
        editingCalendar.id,
        {
          name: calendarName.trim(),
          color: calendarColor,
        },
      );

      toast.success(`Calendar "${calendarName}" updated`);
      resetForm();
      onSuccess?.("update", updatedCalendar);
    } catch (error: any) {
      console.error("Failed to update calendar:", error);
      if (error.message && error.message.includes("already exists")) {
        setValidationErrors({
          name: "A calendar with this name already exists",
        });
      } else {
        toast.error("Failed to update calendar");
      }
    } finally {
      setSaving(false);
    }
  }, [
    editingCalendar,
    calendarName,
    calendarColor,
    calendarData,
    validateForm,
    resetForm,
    onSuccess,
  ]);

  // Delete calendar
  const deleteCalendar = useCallback(
    async (calendar: Calendar) => {
      setSaving(true);
      try {
        await calendarData.deleteCalendar(calendar.id);
        toast.success(`Calendar "${calendar.name}" deleted`);
        onSuccess?.("delete", calendar);
      } catch (error: any) {
        console.error("Failed to delete calendar:", error);
        toast.error("Failed to delete calendar");
      } finally {
        setSaving(false);
      }
    },
    [calendarData, onSuccess],
  );

  // Start editing a calendar
  const startEdit = useCallback((calendar: Calendar) => {
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

// Hook for managing color selection
interface UseColorSelectorProps {
  initialColor?: string;
  onColorChange?: (color: string) => void;
  presetColors?: string[];
}

interface UseColorSelectorReturn {
  selectedColor: string;
  setSelectedColor: (color: string) => void;
  isPresetColor: (color: string) => boolean;
  presetColors: string[];
}

export function useColorSelector({
  initialColor = "#3b82f6",
  onColorChange,
  presetColors = [
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
  ],
}: UseColorSelectorProps = {}): UseColorSelectorReturn {
  const [selectedColor, setSelectedColorState] = useState(initialColor);

  const setSelectedColor = useCallback(
    (color: string) => {
      setSelectedColorState(color);
      onColorChange?.(color);
    },
    [onColorChange],
  );

  const isPresetColor = useCallback(
    (color: string) => {
      return presetColors.includes(color);
    },
    [presetColors],
  );

  return {
    selectedColor,
    setSelectedColor,
    isPresetColor,
    presetColors,
  };
}
