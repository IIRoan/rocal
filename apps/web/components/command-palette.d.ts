import React from "react";
import type { CalendarEvent } from "@workspace/ui/components/calendar/types";
interface CommandPaletteProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    eventToEdit?: CalendarEvent | null;
    onEventSaved?: () => void;
    initialView?: string;
}
export declare function CommandPalette({ open, onOpenChange, eventToEdit, onEventSaved, initialView, }: CommandPaletteProps): React.JSX.Element;
export {};
//# sourceMappingURL=command-palette.d.ts.map