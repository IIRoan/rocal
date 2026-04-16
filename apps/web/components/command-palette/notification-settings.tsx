import React from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import { VisuallyHidden } from "@workspace/ui/components/ui/visually-hidden";
import { Switch } from "@workspace/ui/components/ui/switch";
import { Input } from "@workspace/ui/components/ui/input";
import { Mail, Clock, ArrowLeft } from "lucide-react";
import type { UserSettings } from "@/lib/types/calendar";
import type { PaletteView } from "./constants";

interface NotificationSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  localSettings: UserSettings;
  updateSetting: (key: keyof UserSettings, value: any) => void;
  goBack: () => void;
  TransitionContainer: React.ComponentType<{
    direction: "forward" | "back";
    children: React.ReactNode;
    viewKey?: string;
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="spotlight"
        showClose={false}
        className="overflow-hidden p-0 bg-popover border-border/50 shadow-2xl max-h-[480px]"
      >
        <VisuallyHidden>
          <DialogTitle>Notification Settings</DialogTitle>
        </VisuallyHidden>
        <TransitionContainer
          direction={transitionDirection}
          viewKey="notifications"
        >
          <div className="flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
              <button
                onClick={() => goBack()}
                className="p-1 rounded hover:bg-muted/50 transition-colors"
              >
                <ArrowLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              <span className="text-sm font-medium">Notifications</span>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {/* Notification Types Section */}
              <div className="px-4 py-2 text-xs font-medium text-muted-foreground">
                Notification Types
              </div>
              <div className="p-1">
                <div
                  onClick={() =>
                    updateSetting(
                      "emailNotifications",
                      !localSettings.emailNotifications,
                    )
                  }
                  className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer hover:bg-accent/30 transition-colors"
                >
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">Email Notifications</div>
                    <div className="text-xs text-muted-foreground">
                      Receive event reminders via email
                    </div>
                  </div>
                  <Switch
                    checked={localSettings.emailNotifications}
                    className="shrink-0 scale-75 origin-right"
                  />
                </div>
              </div>

              {/* Default Reminder Section */}
              <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-t border-border/50 mt-1">
                Default Reminder
              </div>
              <div className="px-4 py-3">
                <div className="flex items-center gap-3 mb-2">
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1">
                    <div className="text-sm">Default Reminder (minutes)</div>
                    <div className="text-xs text-muted-foreground">
                      Leave empty for no reminder
                    </div>
                  </div>
                </div>
                <Input
                  type="number"
                  value={localSettings.defaultReminder || ""}
                  onChange={(e) =>
                    updateSetting(
                      "defaultReminder",
                      e.target.value ? parseInt(e.target.value) : null,
                    )
                  }
                  placeholder="No default reminder"
                  min={1}
                  max={43200}
                  className="h-9 text-sm"
                />
              </div>
            </div>
          </div>
        </TransitionContainer>
      </DialogContent>
    </Dialog>
  );
}
