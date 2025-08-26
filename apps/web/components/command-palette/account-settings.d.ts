import React from "react";
import type { PaletteView } from "./constants";
interface AccountSettingsProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    goBack: (view: PaletteView) => void;
    saving: boolean;
    handleReset: () => void;
    TransitionContainer: React.ComponentType<{
        direction: "forward" | "back";
        children: React.ReactNode;
    }>;
    transitionDirection: "forward" | "back";
}
export declare function AccountSettings({ open, onOpenChange, goBack, saving, handleReset, TransitionContainer, transitionDirection, }: AccountSettingsProps): React.JSX.Element;
export {};
//# sourceMappingURL=account-settings.d.ts.map