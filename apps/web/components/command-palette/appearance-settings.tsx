import React from "react";
import { Sun, Moon, Monitor, Layout, Check } from "lucide-react";
import type { UserSettings } from "@/lib/types/calendar";
import { CALENDAR_VIEWS } from "@workspace/ui/components/calendar";
import { PaletteNavRow, PaletteSection, PaletteView } from "./palette-ui";

interface AppearanceSettingsProps {
  localSettings: UserSettings;
  updateSetting: (key: keyof UserSettings, value: any) => void;
  goBack: () => void;
}

const THEME_OPTIONS = [
  { value: "light", icon: Sun, label: "Light Theme" },
  { value: "dark", icon: Moon, label: "Dark Theme" },
  { value: "system", icon: Monitor, label: "System Theme" },
] as const;

const selectedCheck = <Check className="size-4 shrink-0 text-foreground" />;

export function AppearanceSettings({
  localSettings,
  updateSetting,
  goBack,
}: AppearanceSettingsProps) {
  return (
    <PaletteView title="Appearance" onBack={goBack}>
      <PaletteSection label="Theme">
        {THEME_OPTIONS.map((item) => (
          <PaletteNavRow
            key={item.value}
            icon={item.icon}
            label={item.label}
            onClick={() => updateSetting("theme", item.value)}
            trailing={localSettings.theme === item.value ? selectedCheck : null}
          />
        ))}
      </PaletteSection>
      <PaletteSection label="Default View">
        {CALENDAR_VIEWS.map((view) => (
          <PaletteNavRow
            key={view}
            icon={Layout}
            label={
              <span className="capitalize">
                {view === "3day" ? "3 Days" : `${view} View`}
              </span>
            }
            onClick={() => updateSetting("defaultView", view)}
            trailing={localSettings.defaultView === view ? selectedCheck : null}
          />
        ))}
      </PaletteSection>
    </PaletteView>
  );
}
