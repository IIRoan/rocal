import React from "react";
import {
  CommandDialog,
  CommandList,
  CommandGroup,
  CommandItem,
} from "@workspace/ui/components/navigation/command";
import { Switch } from "@workspace/ui/components/ui/switch";
import { Input } from "@workspace/ui/components/ui/input";
import { Label } from "@workspace/ui/components/ui/label";
import {
  Mail,
  Clock,
  ArrowLeft,
} from "lucide-react";
import type { UserSettings } from "@/lib/types/calendar";
import type { PaletteView } from "./constants";

interface NotificationSettingsProps {
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

export function NotificationSettings({
  open,
  onOpenChange,
  localSettings,
  updateSetting,
  goBack,
  TransitionContainer,
  transitionDirection,
}: NotificationSettingsProps) {
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
            Notifications
          </h2>
        </div>
        <CommandList>
          <CommandGroup heading="Notification Types">
            <CommandItem
              onSelect={() =>
                updateSetting(
                  "emailNotifications",
                  !localSettings.emailNotifications
                )
              }
              className="px-4 py-3 hover:bg-accent/20 data-[selected=true]:bg-accent/30"
            >
              <Mail className="mr-3 h-4 w-4 text-muted-foreground" />
              <div className="flex flex-col">
                <span className="text-foreground">Email Notifications</span>
                <span className="text-xs text-muted-foreground">
                  Receive event reminders via email
                </span>
              </div>
              <Switch
                checked={localSettings.emailNotifications}
                className="ml-auto"
              />
            </CommandItem>
          </CommandGroup>

          <CommandGroup heading="Default Reminder">
            <div className="px-4 py-3">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <Label className="text-sm font-medium text-foreground">
                      Default Reminder Time (minutes)
                    </Label>
                    <span className="text-xs text-muted-foreground">
                      Leave empty for no default reminder
                    </span>
                  </div>
                </div>
                <Input
                  type="number"
                  value={localSettings.defaultReminder || ""}
                  onChange={(e) =>
                    updateSetting(
                      "defaultReminder",
                      e.target.value ? parseInt(e.target.value) : null
                    )
                  }
                  placeholder="No default reminder"
                  min={1}
                  max={43200}
                  className="w-full"
                />
              </div>
            </div>
          </CommandGroup>
        </CommandList>
      </TransitionContainer>
    </CommandDialog>
  );
}