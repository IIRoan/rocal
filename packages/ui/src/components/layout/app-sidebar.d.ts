import * as React from "react";
import { Sidebar } from "../ui/sidebar";
interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
    user?: {
        name: string;
        email: string;
        avatar?: string;
    };
    onLogout?: () => void;
    onOpenSettings?: () => void;
    onOpenCalendarManagement?: () => void;
    isMobile?: boolean;
}
export declare function AppSidebar({ user, onLogout, onOpenSettings, onOpenCalendarManagement, isMobile, ...props }: AppSidebarProps): React.JSX.Element;
export {};
//# sourceMappingURL=app-sidebar.d.ts.map