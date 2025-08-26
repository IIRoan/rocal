import type { Calendar } from "@workspace/ui/components/calendar/types";
interface UseCalendarFormProps {
    calendars: Calendar[];
    calendarData: any;
    onSuccess?: (action: 'create' | 'update' | 'delete', calendar?: Calendar) => void;
}
interface CalendarFormErrors {
    name?: string;
    color?: string;
}
interface UseCalendarFormReturn {
    calendarName: string;
    calendarColor: string;
    editingCalendar: Calendar | null;
    validationErrors: CalendarFormErrors;
    saving: boolean;
    setCalendarName: (name: string) => void;
    setCalendarColor: (color: string) => void;
    setEditingCalendar: (calendar: Calendar | null) => void;
    setValidationErrors: (errors: CalendarFormErrors) => void;
    setSaving: (saving: boolean) => void;
    resetForm: () => void;
    validateForm: () => boolean;
    createCalendar: () => Promise<void>;
    updateCalendar: () => Promise<void>;
    deleteCalendar: (calendar: Calendar) => Promise<void>;
    startEdit: (calendar: Calendar) => void;
    cancelEdit: () => void;
}
export declare function useCalendarForm({ calendars, calendarData, onSuccess, }: UseCalendarFormProps): UseCalendarFormReturn;
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
export declare function useColorSelector({ initialColor, onColorChange, presetColors, }?: UseColorSelectorProps): UseColorSelectorReturn;
export {};
//# sourceMappingURL=use-calendar-form.d.ts.map