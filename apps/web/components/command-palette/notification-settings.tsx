import React, { useState } from "react";
import { Mail, Bell, ArrowLeft, Send, Smartphone } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { UserSettings } from "@/lib/types/calendar";
import {
  APP_NOTIFICATION_SETTING,
  APP_NOTIFICATION_WEB_HINT,
  EMAIL_REMINDER_SETTING,
  NOTIFICATION_SETTINGS_INTRO,
  PUSH_DEVICES_QUERY_KEY,
  PUSH_DEVICES_SECTION,
  TEST_NOTIFICATION_SETTING,
  TEST_NOTIFICATION_SUCCESS,
  formatPushDeviceLabel,
  formatPushDeviceLastSeen,
  getErrorMessage,
  getPushDevicesListStatus,
  type PushDeviceSummary,
} from "@workspace/calendar-core";
import { calendarApiService } from "@/lib/calendar-api-service";
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
  const [isSendingTest, setIsSendingTest] = useState(false);
  const queryClient = useQueryClient();
  const appEnabled = localSettings.pushNotifications !== false;

  const devicesQuery = useQuery({
    queryKey: PUSH_DEVICES_QUERY_KEY,
    queryFn: () => calendarApiService.listPushDevices(),
    staleTime: 30_000,
    enabled: appEnabled,
  });

  const handleSendTest = () => {
    if (isSendingTest) return;
    setIsSendingTest(true);
    void calendarApiService
      .sendTestPushNotification()
      .then(() => {
        toast.success(TEST_NOTIFICATION_SUCCESS);
        void queryClient.invalidateQueries({ queryKey: PUSH_DEVICES_QUERY_KEY });
      })
      .catch((error: unknown) => {
        toast.error(
          getErrorMessage(error, "Failed to send test notification."),
        );
      })
      .finally(() => {
        setIsSendingTest(false);
      });
  };

  return (
    <NotificationSettingsView
      localSettings={localSettings}
      updateSetting={updateSetting}
      goBack={goBack}
      isSendingTest={isSendingTest}
      onSendTest={handleSendTest}
      devices={devicesQuery.data?.devices ?? []}
      devicesLoading={devicesQuery.isLoading}
      devicesError={devicesQuery.isError}
    />
  );
}

type NotificationSettingsViewProps = {
  localSettings: UserSettings;
  updateSetting: (key: keyof UserSettings, value: any) => void;
  goBack: () => void;
  isSendingTest: boolean;
  onSendTest: () => void;
  devices: PushDeviceSummary[];
  devicesLoading: boolean;
  devicesError: boolean;
};

export function NotificationSettingsView({
  localSettings,
  updateSetting,
  goBack,
  isSendingTest,
  onSendTest,
  devices,
  devicesLoading,
  devicesError,
}: NotificationSettingsViewProps) {
  const appEnabled = localSettings.pushNotifications !== false;
  const devicesStatus = getPushDevicesListStatus({
    appEnabled,
    loading: devicesLoading,
    error: devicesError,
    deviceCount: devices.length,
  });

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
        <button
          type="button"
          onClick={() => goBack()}
          className="p-1 rounded hover:bg-muted/50 transition-colors cursor-pointer"
          aria-label="Back"
        >
          <ArrowLeft className="size-4 text-muted-foreground" />
        </button>
        <span className="text-sm font-medium">Notifications</span>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-4 pt-3 pb-1 text-xs text-muted-foreground leading-relaxed">
          {NOTIFICATION_SETTINGS_INTRO}
        </div>
        <div className="px-4 py-2 text-xs font-medium text-muted-foreground">
          Mail
        </div>
        <div className="p-1">
          <SettingToggleRow
            checked={localSettings.emailNotifications}
            description={EMAIL_REMINDER_SETTING.description}
            icon={Mail}
            label={EMAIL_REMINDER_SETTING.label}
            onToggle={() =>
              updateSetting(
                "emailNotifications",
                !localSettings.emailNotifications,
              )
            }
          />
        </div>
        <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-t border-border/50 mt-1">
          App
        </div>
        <div className="p-1">
          <SettingToggleRow
            checked={appEnabled}
            description={APP_NOTIFICATION_SETTING.description}
            icon={Bell}
            label={APP_NOTIFICATION_SETTING.label}
            onToggle={() => updateSetting("pushNotifications", !appEnabled)}
          />
          <p className="px-3 pb-2 text-xs text-muted-foreground leading-relaxed">
            {APP_NOTIFICATION_WEB_HINT}
          </p>
          <button
            type="button"
            onClick={onSendTest}
            disabled={!appEnabled || isSendingTest}
            className="flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent/30 focus:bg-accent/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="size-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm">{TEST_NOTIFICATION_SETTING.label}</div>
              <div className="text-xs text-muted-foreground">
                {TEST_NOTIFICATION_SETTING.description}
              </div>
            </div>
          </button>
        </div>
        <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-t border-border/50 mt-1">
          {PUSH_DEVICES_SECTION.label}
        </div>
        <div className="p-1">
          {devicesStatus === "paused" ? (
            <p className="px-3 py-2 text-xs text-muted-foreground leading-relaxed">
              {PUSH_DEVICES_SECTION.paused}
            </p>
          ) : null}
          {devicesStatus === "loading" ? (
            <p className="px-3 py-2 text-xs text-muted-foreground leading-relaxed">
              {PUSH_DEVICES_SECTION.loading}
            </p>
          ) : null}
          {devicesStatus === "error" ? (
            <p className="px-3 py-2 text-xs text-muted-foreground leading-relaxed">
              {PUSH_DEVICES_SECTION.error}
            </p>
          ) : null}
          {devicesStatus === "empty" ? (
            <p className="px-3 py-2 text-xs text-muted-foreground leading-relaxed">
              {PUSH_DEVICES_SECTION.empty}
            </p>
          ) : null}
          {devicesStatus === "ready"
            ? devices.map((device) => (
                <div
                  key={device.id}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2"
                >
                  <Smartphone className="size-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">
                      {formatPushDeviceLabel({
                        platform: device.platform ?? "",
                        bundleId: device.bundleId ?? "",
                      })}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatPushDeviceLastSeen(device.lastSeenAt)}
                    </div>
                  </div>
                </div>
              ))
            : null}
        </div>
      </div>
    </div>
  );
}
