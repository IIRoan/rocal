import type { UserSettings, UpdateSettingsRequest } from "@/lib/types/calendar";
interface SettingsContextValue {
    settings: UserSettings | null;
    loading: boolean;
    error: string | null;
    updateSettings: (updates: UpdateSettingsRequest) => Promise<void>;
    resetSettings: () => Promise<void>;
    refetchSettings: () => Promise<void>;
}
declare const SettingsContext: import("react").Context<SettingsContextValue | null>;
export declare function useSettings(): SettingsContextValue;
export declare function useSettingsState(): SettingsContextValue;
export { SettingsContext };
//# sourceMappingURL=use-settings.d.ts.map