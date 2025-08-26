import { ReactNode } from "react";
import type { CalendarEvent } from "@workspace/ui/components/calendar/types";
interface CommandPaletteContextType {
    isOpen: boolean;
    openPalette: () => void;
    closePalette: () => void;
    openEventEditor: (event?: CalendarEvent) => void;
    openCalendarManagement: () => void;
}
export declare function useCommandPalette(): CommandPaletteContextType;
interface CommandPaletteProviderProps {
    children: ReactNode;
    CommandPaletteComponent: React.ComponentType<{
        open: boolean;
        onOpenChange: (open: boolean) => void;
        eventToEdit?: CalendarEvent | null;
        onEventSaved?: () => void;
        initialView?: string;
    }>;
}
export declare function CommandPaletteProvider({ children, CommandPaletteComponent, }: CommandPaletteProviderProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=command-palette-context.d.ts.map