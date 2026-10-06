import React, { useCallback, useState } from "react";
import { Platform } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import {
  APP_NOTIFICATION_IOS_ONLY_HINT,
  APP_NOTIFICATION_PERMISSION_HINT,
  APP_NOTIFICATION_SETTING,
  EMAIL_REMINDER_SETTING,
  NOTIFICATION_SETTINGS_INTRO,
  PUSH_DEVICES_SECTION,
  TEST_NOTIFICATION_SETTING,
  TEST_NOTIFICATION_SUCCESS,
  formatPushDeviceLabel,
  formatPushDeviceLastSeen,
  getErrorMessage,
  getPushDevicesListStatus,
} from "@workspace/calendar-core";
import { SettingsPage } from "../SettingsPage";
import {
  SheetGroup,
  SheetItem,
  SheetMessage,
  SheetScroll,
  SheetSection,
  SheetSwitchItem,
} from "../../sheet/SheetSections";
import { calendarApiService } from "../../../lib/api";
import { QUERY_KEYS } from "../../../lib/query-keys";
import { useNativeUserSettings } from "../../../hooks/use-native-user-settings";
import { usePushDevices } from "../../../hooks/use-push-devices";
import { usePushNotifications } from "../../../providers/PushProvider";
import { useToast } from "../../../providers/ToastProvider";

export function NotificationsSettingsContent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { permissionDenied, refreshRegistration } = usePushNotifications();
  const [isSendingTest, setIsSendingTest] = useState(false);

  const { settings, pendingKeys, updateSetting } = useNativeUserSettings();

  const emailEnabled = settings?.emailNotifications ?? true;
  const appEnabled = settings?.pushNotifications ?? true;

  const devicesQuery = usePushDevices(appEnabled);

  const handleAppNotificationsChange = useCallback(
    (enabled: boolean) => {
      if (enabled) {
        void refreshRegistration()
          .then(() => {
            queryClient.invalidateQueries({
              queryKey: QUERY_KEYS.pushDevices(),
            });
          })
          .catch(() => {
            toast("Could not refresh push registration.", "error");
          });
      }
      updateSetting({ pushNotifications: enabled });
    },
    [queryClient, refreshRegistration, toast, updateSetting],
  );

  const handleSendTest = useCallback(async () => {
    if (isSendingTest) return;
    setIsSendingTest(true);
    try {
      await refreshRegistration();
      await calendarApiService.sendTestPushNotification();
      toast(TEST_NOTIFICATION_SUCCESS);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.pushDevices() });
    } catch (error) {
      toast(
        getErrorMessage(error, "Failed to send test notification."),
        "error",
      );
    } finally {
      setIsSendingTest(false);
    }
  }, [isSendingTest, queryClient, refreshRegistration, toast]);

  const devices = devicesQuery.data?.devices ?? [];
  const devicesStatus = getPushDevicesListStatus({
    appEnabled,
    loading: devicesQuery.isLoading,
    error: devicesQuery.isError,
    deviceCount: devices.length,
  });

  const isIos = Platform.OS === "ios";
  const appFooter = !isIos
    ? APP_NOTIFICATION_IOS_ONLY_HINT
    : permissionDenied
      ? APP_NOTIFICATION_PERMISSION_HINT
      : undefined;

  const devicesMessage =
    devicesStatus === "paused"
      ? PUSH_DEVICES_SECTION.paused
      : devicesStatus === "loading"
        ? PUSH_DEVICES_SECTION.loading
        : devicesStatus === "error"
          ? PUSH_DEVICES_SECTION.error
          : devicesStatus === "empty"
            ? PUSH_DEVICES_SECTION.empty
            : null;

  return (
    <SettingsPage title="Notifications">
      <SheetScroll>
        <SheetMessage text={NOTIFICATION_SETTINGS_INTRO} />

        <SheetSection title="Mail">
          <SheetGroup>
            <SheetSwitchItem
              icon="mail"
              label={EMAIL_REMINDER_SETTING.label}
              detail={EMAIL_REMINDER_SETTING.description}
              value={emailEnabled}
              onValueChange={(value) =>
                updateSetting({ emailNotifications: value })
              }
              pending={pendingKeys.has("emailNotifications")}
            />
          </SheetGroup>
        </SheetSection>

        <SheetSection title="App" footer={appFooter}>
          <SheetGroup>
            <SheetSwitchItem
              icon="bell"
              label={APP_NOTIFICATION_SETTING.label}
              detail={APP_NOTIFICATION_SETTING.description}
              value={appEnabled}
              onValueChange={handleAppNotificationsChange}
              pending={pendingKeys.has("pushNotifications")}
            />
            {isIos ? (
              <SheetItem
                icon="send"
                label={TEST_NOTIFICATION_SETTING.label}
                detail={TEST_NOTIFICATION_SETTING.description}
                chevron
                onPress={() => void handleSendTest()}
                pending={isSendingTest}
                disabled={!appEnabled || permissionDenied}
                accessibilityLabel={TEST_NOTIFICATION_SETTING.label}
              />
            ) : null}
          </SheetGroup>
        </SheetSection>

        <SheetSection title={PUSH_DEVICES_SECTION.label}>
          {devicesMessage ? (
            <SheetMessage
              text={devicesMessage}
              tone={devicesStatus === "error" ? "destructive" : "muted"}
            />
          ) : (
            <SheetGroup>
              {devices.map((device) => (
                <SheetItem
                  key={device.id}
                  icon="smartphone"
                  label={formatPushDeviceLabel(device)}
                  detail={formatPushDeviceLastSeen(device.lastSeenAt)}
                />
              ))}
            </SheetGroup>
          )}
        </SheetSection>
      </SheetScroll>
    </SettingsPage>
  );
}
