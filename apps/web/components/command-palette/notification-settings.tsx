import React from "react";
import { Mail, ArrowLeft } from "lucide-react";
import type { UserSettings } from "@/lib/types/calendar";
import { SettingToggleRow } from "./setting-toggle-row";

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
                <ArrowLeft className="size-4 text-muted-foreground" />
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
                <SettingToggleRow
                  checked={localSettings.emailNotifications}
                  description="Receive event reminders via email"
                  icon={Mail}
                  label="Email Notifications"
                  onToggle={() =>
                    updateSetting(
                      "emailNotifications",
                      !localSettings.emailNotifications,
                    )
                  }
                />
              </div>
            </div>
    </div>
  );
}
