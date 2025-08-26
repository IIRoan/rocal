import React from "react";
import { type PaletteView } from "./command-palette/index";
interface CalendarManagerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onBack: () => void;
    onGoToSubscriptions: () => void;
    currentView: PaletteView;
    onViewChange: (view: PaletteView) => void;
    transitionDirection: "forward" | "back";
}
export declare function CalendarManager({ open, onOpenChange, onBack, onGoToSubscriptions, currentView, onViewChange, transitionDirection, }: CalendarManagerProps): React.JSX.Element | null;
export {};
//# sourceMappingURL=calendar-manager.d.ts.map