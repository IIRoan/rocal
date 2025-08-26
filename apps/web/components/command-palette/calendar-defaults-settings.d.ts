import React from "react";
import type { UserSettings } from "@/lib/types/calendar";
import { type PaletteView } from "./constants";
interface CalendarDefaultsSettingsProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    localSettings: UserSettings;
    updateSetting: (key: keyof UserSettings, value: any) => void;
    goBack: (view: PaletteView) => void;
    workingDaysList: number[];
    TransitionContainer: React.ComponentType<{
        direction: "forward" | "back";
        children: React.ReactNode;
    }>;
    transitionDirection: "forward" | "back";
}
export declare function CalendarDefaultsSettings({ open, onOpenChange, localSettings, updateSetting, goBack, workingDaysList, TransitionContainer, transitionDirection, }: CalendarDefaultsSettingsProps): React.JSX.Element;
export {};
//# sourceMappingURL=calendar-defaults-settings.d.ts.map