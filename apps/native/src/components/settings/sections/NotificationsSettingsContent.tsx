import React, { useCallback, useState } from "react";
import { Platform } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  type UpdateSettingsRequest,
  type UserSettings,
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
import { usePushNotifications } from "../../../providers/PushProvider";
import { useToast } from "../../../providers/ToastProvider";

export function NotificationsSettingsContent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { permissionDenied, refreshRegistration } = usePushNotifications();
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const [isSendingTest, setIsSendingTest] = useState(false);

  const { data: settings } = useQuery({
    queryKey: QUERY_KEYS.settings(),
    queryFn: () => calendarApiService.getUserSettings(),
    staleTime: 5 * 60 * 1000,
  });

  const emailEnabled = settings?.emailNotifications ?? true;
  const appEnabled = settings?.pushNotifications ?? true;

  const devicesQuery = useQuery({
    queryKey: QUERY_KEYS.pushDevices(),
    queryFn: () => calendarApiService.listPushDevices(),
    staleTime: 30_000,
    enabled: appEnabled,
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (update: UpdateSettingsRequest) =>
      calendarApiService.updateUserSettings(update),
    onMutate: async (update) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.settings() });
      const previous = queryClient.getQueryData<UserSettings>(
        QUERY_KEYS.settings(),
      );
      if (previous) {
        queryClient.setQueryData<UserSettings>(QUERY_KEYS.settings(), {
          ...previous,
          ...update,
        });
      }
      const keys = Object.keys(update);
      setPendingKeys((prev) => {
        const next = new Set(prev);
        for (const key of keys) next.add(key);
        return next;
      });
      return { previous };
    },
    onError: (_err, _update, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEYS.settings(), context.previous);
      }
    },
    onSettled: (_data, _error, update) => {
      const keys = Object.keys(update);
      setPendingKeys((prev) => {
        const next = new Set(prev);
        for (const key of keys) next.delete(key);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings() });
    },
  });

  const updateSetting = useCallback(
    (update: UpdateSettingsRequest) => {
      updateSettingsMutation.mutate(update);
    },
    [updateSettingsMutation],
  );

  const handleAppNotificationsChange = useCallback(
    (enabled: boolean) => {
      if (enabled) {
        void refreshRegistration().then(() => {
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.pushDevices() });
        });
      }
      updateSetting({ pushNotifications: enabled });
    },
    [queryClient, refreshRegistration, updateSetting],
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
