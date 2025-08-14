import React from "react";
import {
  CommandDialog,
  CommandList,
  CommandGroup,
  CommandItem,
} from "@workspace/ui/components/navigation/command";
import { Switch } from "@workspace/ui/components/ui/switch";
import {
  Sun,
  Moon,
  Monitor,
  Layout,
  Eye,
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
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <TransitionContainer direction={transitionDirection}>
        <div className="bg-card/50 border-b border-border px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => goBack("main")}
            className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <h2 className="text-lg font-semibold text-foreground">
            Appearance
          </h2>
        </div>
        <CommandList>
          <CommandGroup heading="Theme">
            <CommandItem
              onSelect={() => updateSetting("theme", "light")}
              className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
            >
              <Sun className="mr-3 h-4 w-4 text-amber-500" />
              <span className="text-foreground">Light Theme</span>
              {localSettings.theme === "light" && (
                <Check className="ml-auto h-4 w-4 text-primary" />
              )}
            </CommandItem>
            <CommandItem
              onSelect={() => updateSetting("theme", "dark")}
              className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
            >
              <Moon className="mr-3 h-4 w-4 text-slate-400" />
              <span className="text-foreground">Dark Theme</span>
              {localSettings.theme === "dark" && (
                <Check className="ml-auto h-4 w-4 text-primary" />
              )}
            </CommandItem>
            <CommandItem
              onSelect={() => updateSetting("theme", "system")}
              className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
            >
              <Monitor className="mr-3 h-4 w-4 text-muted-foreground" />
              <span className="text-foreground">System Theme</span>
              {localSettings.theme === "system" && (
                <Check className="ml-auto h-4 w-4 text-primary" />
              )}
            </CommandItem>
          </CommandGroup>

          <CommandGroup heading="Default View">
            <CommandItem
              onSelect={() => updateSetting("defaultView", "month")}
              className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
            >
              <Layout className="mr-3 h-4 w-4 text-muted-foreground" />
              <span className="text-foreground">Month View</span>
              {localSettings.defaultView === "month" && (
                <Check className="ml-auto h-4 w-4 text-primary" />
              )}
            </CommandItem>
            <CommandItem
              onSelect={() => updateSetting("defaultView", "week")}
              className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
            >
              <Layout className="mr-3 h-4 w-4 text-muted-foreground" />
              <span className="text-foreground">Week View</span>
              {localSettings.defaultView === "week" && (
                <Check className="ml-auto h-4 w-4 text-primary" />
              )}
            </CommandItem>
            <CommandItem
              onSelect={() => updateSetting("defaultView", "day")}
              className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
            >
              <Layout className="mr-3 h-4 w-4 text-muted-foreground" />
              <span className="text-foreground">Day View</span>
              {localSettings.defaultView === "day" && (
                <Check className="ml-auto h-4 w-4 text-primary" />
              )}
            </CommandItem>
            <CommandItem
              onSelect={() => updateSetting("defaultView", "agenda")}
              className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
            >
              <Layout className="mr-3 h-4 w-4 text-muted-foreground" />
              <span className="text-foreground">Agenda View</span>
              {localSettings.defaultView === "agenda" && (
                <Check className="ml-auto h-4 w-4 text-primary" />
              )}
            </CommandItem>
          </CommandGroup>

          <CommandGroup heading="Display Options">
            <CommandItem
              onSelect={() =>
                updateSetting("compactView", !localSettings.compactView)
              }
              className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
            >
              <Eye className="mr-3 h-4 w-4 text-muted-foreground" />
              <span className="text-foreground">Compact View</span>
              <Switch
                checked={localSettings.compactView}
                className="ml-auto"
              />
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </TransitionContainer>
    </CommandDialog>
  );
}