import React from "react";
import type { UserSettings } from "@/lib/types/calendar";
import type { PaletteView } from "./constants";
interface NotificationSettingsProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    localSettings: UserSettings;
    updateSetting: (key: keyof UserSettings, value: any) => void;
    goBack: (view: PaletteView) => void;
    TransitionContainer: React.ComponentType<{
        direction: "forward" | "back";
        children: React.ReactNode;
    }>;
    transitionDirection: "forward" | "back";
}
export declare function NotificationSettings({ open, onOpenChange, localSettings, updateSetting, goBack, TransitionContainer, transitionDirection, }: NotificationSettingsProps): React.JSX.Element;
export {};
//# sourceMappingURL=notification-settings.d.ts.map