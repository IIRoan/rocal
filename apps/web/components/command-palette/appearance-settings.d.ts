import React from "react";
import type { UserSettings } from "@/lib/types/calendar";
import type { PaletteView } from "./constants";
interface AppearanceSettingsProps {
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
export declare function AppearanceSettings({ open, onOpenChange, localSettings, updateSetting, goBack, TransitionContainer, transitionDirection, }: AppearanceSettingsProps): React.JSX.Element;
export {};
//# sourceMappingURL=appearance-settings.d.ts.map