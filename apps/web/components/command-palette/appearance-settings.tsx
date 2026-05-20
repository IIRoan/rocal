import React from "react";
import { Sun, Moon, Monitor, Layout, Check, ArrowLeft } from "lucide-react";
import type { UserSettings } from "@/lib/types/calendar";
import type { CalendarView } from "@workspace/ui/components/calendar";
import { CALENDAR_VIEWS } from "@workspace/ui/components/calendar";

interface AppearanceSettingsProps {
  localSettings: UserSettings;
  updateSetting: (key: keyof UserSettings, value: any) => void;
  goBack: () => void;
}

export function AppearanceSettings({
  localSettings,
  updateSetting,
  goBack,
}: AppearanceSettingsProps) {
  return (
    <div
      className="flex flex-col"
      style={{ minHeight: "320px", maxHeight: "calc(100dvh - 200px)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 shrink-0">
        <button
          onClick={() => goBack()}
          className="p-1 rounded hover:bg-muted/50 transition-colors"
        >
          <ArrowLeft className="size-4 text-muted-foreground" />
        </button>
        <span className="text-sm font-medium">Appearance</span>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {/* Theme Section */}
        <div className="px-3 py-1 text-xs font-medium text-muted-foreground">
          Theme
        </div>
        <div className="px-2 pb-1">
          {[
            {
              value: "light",
              icon: Sun,
              label: "Light Theme",
              color: "text-amber-500",
            },
            {
              value: "dark",
              icon: Moon,
              label: "Dark Theme",
              color: "text-slate-400",
            },
            {
              value: "system",
              icon: Monitor,
              label: "System Theme",
              color: "text-muted-foreground",
            },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => updateSetting("theme", item.value)}
              className="flex items-center gap-3 p-2 w-full rounded-md text-left hover:bg-accent/50 focus:bg-accent/50 focus:outline-none transition-colors"
            >
              <div className="flex items-center justify-center size-6 shrink-0">
                <item.icon className={`size-4 ${item.color}`} />
              </div>
              <span className="text-sm flex-1">{item.label}</span>
              {localSettings.theme === item.value && (
                <Check className="size-4 text-primary shrink-0" />
              )}
            </button>
          ))}
        </div>

        {/* Default View Section */}
        <div className="px-3 py-1 text-xs font-medium text-muted-foreground border-t border-border/50 mt-1">
          Default View
        </div>
        <div className="px-2">
          {CALENDAR_VIEWS.map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => updateSetting("defaultView", view)}
              className="flex items-center gap-3 p-2 w-full rounded-md text-left hover:bg-accent/50 focus:bg-accent/50 focus:outline-none transition-colors"
            >
              <div className="flex items-center justify-center size-6 shrink-0">
                <Layout className="size-4 text-muted-foreground" />
              </div>
              <span className="text-sm flex-1 capitalize">
                {view === "3day" ? "3 Days" : `${view} View`}
              </span>
              {localSettings.defaultView === view && (
                <Check className="size-4 text-primary shrink-0" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
