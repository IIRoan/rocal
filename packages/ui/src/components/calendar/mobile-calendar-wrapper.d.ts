import React from "react";
import { MobileEventCalendarProps } from "./mobile-event-calendar";
interface MobileCalendarWrapperProps extends MobileEventCalendarProps {
    user?: {
        name: string;
        email: string;
        avatar?: string;
    };
    onLogout?: () => void;
    onOpenSettings?: () => void;
    onOpenCalendarManagement?: () => void;
    onOpenAddEvent?: () => void;
}
export declare function MobileCalendarWrapper({ user, onLogout, onOpenSettings, onOpenCalendarManagement, onOpenAddEvent, children, className, ...props }: MobileCalendarWrapperProps & {
    children?: React.ReactNode;
}): React.JSX.Element;
export {};
//# sourceMappingURL=mobile-calendar-wrapper.d.ts.map