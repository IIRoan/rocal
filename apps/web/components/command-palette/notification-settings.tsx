import React from "react";
import { Switch } from "@workspace/ui/components/ui/switch";
import { Mail, ArrowLeft } from "lucide-react";
import type { UserSettings } from "@/lib/types/calendar";

interface NotificationSettingsProps {
  localSettings: UserSettings;
  updateSetting: (key: keyof UserSettings, value: any) => void;
  goBack: () => void;
}

export function NotificationSettings({
  localSettings,
  updateSetting,
  goBack,
}: NotificationSettingsProps) {
  return (
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
              {localSettings.eventEncryptionMode === "full" ? (
                <div className="px-4 pt-3 pb-1 text-xs text-muted-foreground leading-relaxed">
                  Full encryption is active, so reminder emails only include when the event happens.
                </div>
              ) : null}
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
            </div>
    </div>
  );
}
