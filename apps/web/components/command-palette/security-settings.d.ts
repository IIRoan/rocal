import React from "react";
import type { PaletteView } from "./constants";
interface SecuritySettingsProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    goBack: (view: PaletteView) => void;
    goForward: (view: PaletteView) => void;
    TransitionContainer: React.ComponentType<{
        direction: "forward" | "back";
        children: React.ReactNode;
    }>;
    transitionDirection: "forward" | "back";
}
export declare function SecuritySettings({ open, onOpenChange, goBack, goForward, TransitionContainer, transitionDirection, }: SecuritySettingsProps): React.JSX.Element;
export {};
//# sourceMappingURL=security-settings.d.ts.map