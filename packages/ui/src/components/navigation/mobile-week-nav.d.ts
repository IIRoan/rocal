import React from "react";
import { CalendarView } from "../calendar/types";
interface MobileWeekNavProps {
    currentDate: Date;
    currentView: CalendarView;
    onDateChange: (date: Date) => void;
    onTodayClick?: () => void;
    className?: string;
}
export declare function MobileWeekNav({ currentDate, currentView, onDateChange, onTodayClick, className, }: MobileWeekNavProps): React.JSX.Element;
export {};
//# sourceMappingURL=mobile-week-nav.d.ts.map