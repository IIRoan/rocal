import React, { useState } from "react";
import { Mail, Bell, Send, Smartphone } from "lucide-react";
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
import {
  PaletteIconBox,
  PaletteNavRow,
  PaletteSection,
  PaletteView,
} from "./palette-ui";

const TEXT_BLOCK_CLASS = "p-2 text-[13px] leading-[130%] text-muted-foreground";

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
        void queryClient.invalidateQueries({
          queryKey: PUSH_DEVICES_QUERY_KEY,
        });
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
    <PaletteView title="Notifications" onBack={goBack}>
      <p className={TEXT_BLOCK_CLASS}>{NOTIFICATION_SETTINGS_INTRO}</p>
      <PaletteSection label="Mail">
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
      </PaletteSection>
      <PaletteSection label="App">
        <SettingToggleRow
          checked={appEnabled}
          description={APP_NOTIFICATION_SETTING.description}
          icon={Bell}
          label={APP_NOTIFICATION_SETTING.label}
          onToggle={() => updateSetting("pushNotifications", !appEnabled)}
        />
        <p className={TEXT_BLOCK_CLASS}>{APP_NOTIFICATION_WEB_HINT}</p>
        <PaletteNavRow
          icon={Send}
          label={TEST_NOTIFICATION_SETTING.label}
          description={TEST_NOTIFICATION_SETTING.description}
          trailing={null}
          onClick={onSendTest}
          disabled={!appEnabled || isSendingTest}
        />
      </PaletteSection>
      <PaletteSection label={PUSH_DEVICES_SECTION.label}>
        {devicesStatus === "paused" ? (
          <p className={TEXT_BLOCK_CLASS}>{PUSH_DEVICES_SECTION.paused}</p>
        ) : null}
        {devicesStatus === "loading" ? (
          <p className={TEXT_BLOCK_CLASS}>{PUSH_DEVICES_SECTION.loading}</p>
        ) : null}
        {devicesStatus === "error" ? (
          <p className={TEXT_BLOCK_CLASS}>{PUSH_DEVICES_SECTION.error}</p>
        ) : null}
        {devicesStatus === "empty" ? (
          <p className={TEXT_BLOCK_CLASS}>{PUSH_DEVICES_SECTION.empty}</p>
        ) : null}
        {devicesStatus === "ready"
          ? devices.map((device) => (
              <div key={device.id} className="flex items-center gap-3 p-2">
                <PaletteIconBox>
                  <Smartphone className="size-4" />
                </PaletteIconBox>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] leading-[130%] text-foreground">
                    {formatPushDeviceLabel({
                      platform: device.platform ?? "",
                      bundleId: device.bundleId ?? "",
                    })}
                  </div>
                  <div className="text-[13px] leading-[130%] text-muted-foreground">
                    {formatPushDeviceLastSeen(device.lastSeenAt)}
                  </div>
                </div>
              </div>
            ))
          : null}
      </PaletteSection>
    </PaletteView>
  );
}
