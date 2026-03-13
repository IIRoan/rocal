import React from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import { VisuallyHidden } from "@workspace/ui/components/ui/visually-hidden";
import {
  Sun,
  Moon,
  Monitor,
  Layout,
  Check,
  ArrowLeft,
} from "lucide-react";
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
    viewKey?: string;
  }>;
  transitionDirection: "forward" | "back";
}

export function AppearanceSettings({
  open,
  onOpenChange,
  localSettings,
  updateSetting,
  goBack,
  TransitionContainer,
  transitionDirection,
}: AppearanceSettingsProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="spotlight"
        showClose={false}
        className="overflow-hidden p-0 bg-popover border-border/50 shadow-2xl max-h-[480px]"
      >
        <VisuallyHidden>
          <DialogTitle>Appearance Settings</DialogTitle>
        </VisuallyHidden>
        <TransitionContainer direction={transitionDirection} viewKey="appearance">
          <div className="flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
              <button
                onClick={() => goBack("main")}
                className="p-1 rounded hover:bg-muted/50 transition-colors"
              >
                <ArrowLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              <span className="text-sm font-medium">Appearance</span>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {/* Theme Section */}
              <div className="px-4 py-2 text-xs font-medium text-muted-foreground">Theme</div>
              <div className="p-1">
                {[
                  { value: "light", icon: Sun, label: "Light Theme", color: "text-amber-500" },
                  { value: "dark", icon: Moon, label: "Dark Theme", color: "text-slate-400" },
                  { value: "system", icon: Monitor, label: "System Theme", color: "text-muted-foreground" },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => updateSetting("theme", item.value)}
                    className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-accent/30 focus:bg-accent/50 focus:outline-none transition-colors"
                  >
                    <item.icon className={`h-4 w-4 ${item.color} shrink-0`} />
                    <span className="text-sm flex-1">{item.label}</span>
                    {localSettings.theme === item.value && (
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </button>
                ))}
              </div>

              {/* Default View Section */}
              <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-t border-border/50 mt-1">Default View</div>
              <div className="p-1">
                {["month", "week", "day", "agenda"].map((view) => (
                  <button
                    key={view}
                    type="button"
                    onClick={() => updateSetting("defaultView", view)}
                    className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-accent/30 focus:bg-accent/50 focus:outline-none transition-colors"
                  >
                    <Layout className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm flex-1 capitalize">{view} View</span>
                    {localSettings.defaultView === view && (
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </TransitionContainer>
      </DialogContent>
    </Dialog>
  );
}
