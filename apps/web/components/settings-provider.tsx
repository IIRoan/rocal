"use client";

import { SettingsContext, useSettingsState } from "@/hooks/use-settings";

interface SettingsProviderProps {
  children: React.ReactNode;
}

export function SettingsProvider({ children }: SettingsProviderProps) {
  const settingsState = useSettingsState();

  return (
    <SettingsContext.Provider value={settingsState}>
      {children}
    </SettingsContext.Provider>
  );
}