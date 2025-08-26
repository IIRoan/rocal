import React from "react";
import type { UserSettings } from "@/lib/types/calendar";
import { type PaletteView } from "./constants";
interface TimeRegionSettingsProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    localSettings: UserSettings;
    updateSetting: (key: keyof UserSettings, value: any) => void;
    goBack: (view: PaletteView) => void;
    goForward: (view: PaletteView) => void;
    currentView: string;
    TransitionContainer: React.ComponentType<{
        direction: "forward" | "back";
        children: React.ReactNode;
    }>;
    transitionDirection: "forward" | "back";
}
export declare function TimeRegionSettings({ open, onOpenChange, localSettings, updateSetting, goBack, goForward, currentView, TransitionContainer, transitionDirection, }: TimeRegionSettingsProps): React.JSX.Element | null;
export {};
//# sourceMappingURL=time-region-settings.d.ts.map