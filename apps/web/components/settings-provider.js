"use client";
import { SettingsContext, useSettingsState } from "@/hooks/use-settings";
export function SettingsProvider({ children }) {
    const settingsState = useSettingsState();
    return (<SettingsContext.Provider value={settingsState}>
      {children}
    </SettingsContext.Provider>);
}
