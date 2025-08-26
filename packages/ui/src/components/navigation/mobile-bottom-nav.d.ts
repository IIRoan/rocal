import React from "react";
import { CalendarView } from "../calendar/types";
interface MobileBottomNavProps {
    onOpenSidebar?: () => void;
    onOpenAddEvent?: () => void;
    currentView?: CalendarView;
    onViewChange?: (view: CalendarView) => void;
    className?: string;
}
export declare function MobileBottomNav({ onOpenSidebar, onOpenAddEvent, currentView, onViewChange, className, }: MobileBottomNavProps): React.JSX.Element;
export {};
//# sourceMappingURL=mobile-bottom-nav.d.ts.map