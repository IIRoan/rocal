import React from "react";
import type { CalendarEvent } from "@workspace/ui/components/calendar/types";
import type { UserSettings } from "@/lib/types/calendar";
interface EventEditorProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    eventToEdit?: CalendarEvent | null;
    onEventSaved?: () => void;
    onBack: () => void;
    localSettings: UserSettings;
}
export declare function EventEditor({ open, onOpenChange, eventToEdit, onEventSaved, onBack, localSettings, }: EventEditorProps): React.JSX.Element;
export {};
//# sourceMappingURL=event-editor.d.ts.map