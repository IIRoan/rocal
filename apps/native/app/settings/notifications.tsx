import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
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
  type UpdateSettingsRequest,
  type UserSettings,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { AppScreen, StackScreenHeader } from "../../src/components/layout";
import { calendarApiService } from "../../src/lib/api";
import { QUERY_KEYS } from "../../src/lib/query-keys";
import { usePushNotifications } from "../../src/providers/PushProvider";
import { useTheme } from "../../src/providers/ThemeProvider";
import { useToast } from "../../src/providers/ToastProvider";

type FeatherIcon = keyof typeof Feather.glyphMap;

export default function NotificationsSettingsScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
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

  const devicesQuery = useQuery({
    queryKey: QUERY_KEYS.pushDevices(),
    queryFn: () => calendarApiService.listPushDevices(),
    staleTime: 30_000,
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

  const emailEnabled = settings?.emailNotifications ?? true;
  const appEnabled = settings?.pushNotifications ?? true;
  const devices = devicesQuery.data?.devices ?? [];

  return (
    <AppScreen header={<StackScreenHeader title="Notifications" />}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.intro}>{NOTIFICATION_SETTINGS_INTRO}</Text>

        <SectionLabel text="Mail" theme={theme} isFirst />
        <View style={styles.sectionItems}>
          <SettingToggleRow
            icon="mail"
            label={EMAIL_REMINDER_SETTING.label}
            description={EMAIL_REMINDER_SETTING.description}
            value={emailEnabled}
            onValueChange={(value) =>
              updateSetting({ emailNotifications: value })
            }
            isPending={pendingKeys.has("emailNotifications")}
            theme={theme}
          />
        </View>

        <SectionLabel text="App" theme={theme} isFirst={false} />
        <View style={styles.sectionItems}>
          <SettingToggleRow
            icon="bell"
            label={APP_NOTIFICATION_SETTING.label}
            description={APP_NOTIFICATION_SETTING.description}
            value={appEnabled}
            onValueChange={handleAppNotificationsChange}
            isPending={pendingKeys.has("pushNotifications")}
            theme={theme}
          />
          {Platform.OS === "ios" && permissionDenied ? (
            <HintRow text={APP_NOTIFICATION_PERMISSION_HINT} theme={theme} />
          ) : null}
          {Platform.OS !== "ios" ? (
            <HintRow text={APP_NOTIFICATION_IOS_ONLY_HINT} theme={theme} />
          ) : null}
          {Platform.OS === "ios" ? (
            <ActionRow
              icon="send"
              label={TEST_NOTIFICATION_SETTING.label}
              description={TEST_NOTIFICATION_SETTING.description}
              onPress={() => void handleSendTest()}
              theme={theme}
              isPending={isSendingTest}
              disabled={!appEnabled || permissionDenied}
            />
          ) : null}
        </View>

        <SectionLabel text={PUSH_DEVICES_SECTION.label} theme={theme} isFirst={false} />
        <View style={styles.sectionItems}>
          {!appEnabled ? (
            <HintRow text={PUSH_DEVICES_SECTION.paused} theme={theme} />
          ) : null}
          {devicesQuery.isLoading ? (
            <HintRow text={PUSH_DEVICES_SECTION.loading} theme={theme} />
          ) : null}
          {devicesQuery.isError ? (
            <HintRow text={PUSH_DEVICES_SECTION.error} theme={theme} />
          ) : null}
          {!devicesQuery.isLoading &&
          !devicesQuery.isError &&
          devices.length === 0 ? (
            <HintRow text={PUSH_DEVICES_SECTION.empty} theme={theme} />
          ) : null}
          {devices.map((device) => (
            <DeviceRow
              key={device.id}
              label={formatPushDeviceLabel(device)}
              description={formatPushDeviceLastSeen(device.lastSeenAt)}
              theme={theme}
            />
          ))}
        </View>
      </ScrollView>
    </AppScreen>
  );
}

function SectionLabel({
  text,
  theme,
  isFirst = true,
}: {
  text: string;
  theme: ThemeTokens;
  isFirst?: boolean;
}) {
  return (
    <View
      style={{
        paddingHorizontal: theme.spacing["4"],
        paddingTop: isFirst ? theme.spacing["3"] : theme.spacing["2"],
        paddingBottom: theme.spacing["1"],
        ...(isFirst
          ? {}
          : {
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: theme.colors.border,
              marginTop: theme.spacing["2"],
            }),
      }}
    >
      <Text
        style={{
          fontSize: theme.typography.fontSize.xs.size,
          lineHeight: theme.typography.fontSize.xs.lineHeight,
          fontWeight: theme.typography.fontWeight
            .medium as TextStyle["fontWeight"],
          color: theme.colors.mutedForeground,
        }}
        accessibilityRole="header"
      >
        {text}
      </Text>
    </View>
  );
}

function HintRow({ text, theme }: { text: string; theme: ThemeTokens }) {
  return (
    <View
      style={{
        paddingHorizontal: theme.spacing["3"],
        paddingVertical: theme.spacing["2"],
      }}
    >
      <Text
        style={{
          fontSize: theme.typography.fontSize.xs.size,
          lineHeight: theme.typography.fontSize.xs.lineHeight,
          color: theme.colors.mutedForeground,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

function DeviceRow({
  label,
  description,
  theme,
}: {
  label: string;
  description: string;
  theme: ThemeTokens;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing["3"],
        paddingHorizontal: theme.spacing["3"],
        paddingVertical: theme.spacing["3"],
        marginHorizontal: theme.spacing["1"],
      }}
      accessibilityRole="text"
      accessibilityLabel={`${label}. ${description}`}
    >
      <Feather
        name="smartphone"
        size={16}
        color={theme.colors.mutedForeground}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: theme.typography.fontSize.sm.size,
            lineHeight: theme.typography.fontSize.sm.lineHeight,
            color: theme.colors.foreground,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontSize: theme.typography.fontSize.xs.size,
            lineHeight: theme.typography.fontSize.xs.lineHeight,
            color: theme.colors.mutedForeground,
          }}
        >
          {description}
        </Text>
      </View>
    </View>
  );
}

function SettingToggleRow({
  icon,
  label,
  description,
  value,
  onValueChange,
  isPending,
  theme,
}: {
  icon: FeatherIcon;
  label: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  isPending: boolean;
  theme: ThemeTokens;
}) {
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      style={({ pressed }) => [
        {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          gap: theme.spacing["3"],
          paddingHorizontal: theme.spacing["3"],
          paddingVertical: theme.spacing["3"],
          borderRadius: theme.borderRadius.md,
          marginHorizontal: theme.spacing["1"],
        },
        pressed && { backgroundColor: theme.colors.accent },
      ]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
    >
      <Feather
        name={icon}
        size={16}
        color={theme.colors.mutedForeground}
        style={{ marginTop: 2 }}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: theme.typography.fontSize.sm.size,
            lineHeight: theme.typography.fontSize.sm.lineHeight,
            color: theme.colors.foreground,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontSize: theme.typography.fontSize.xs.size,
            lineHeight: theme.typography.fontSize.xs.lineHeight,
            color: theme.colors.mutedForeground,
          }}
        >
          {description}
        </Text>
      </View>
      {isPending ? (
        <ActivityIndicator size="small" />
      ) : (
        <Switch
          value={value}
          pointerEvents="none"
          trackColor={{
            false: theme.colors.input,
            true: theme.colors.primaryBase,
          }}
          thumbColor="#ffffff"
          style={{ transform: [{ scale: 0.85 }] }}
        />
      )}
    </Pressable>
  );
}

function ActionRow({
  icon,
  label,
  description,
  onPress,
  theme,
  isPending = false,
  disabled = false,
}: {
  icon: FeatherIcon;
  label: string;
  description: string;
  onPress: () => void;
  theme: ThemeTokens;
  isPending?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || isPending}
      style={({ pressed }) => [
        {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          gap: theme.spacing["3"],
          paddingHorizontal: theme.spacing["3"],
          paddingVertical: theme.spacing["3"],
          borderRadius: theme.borderRadius.md,
          marginHorizontal: theme.spacing["1"],
          opacity: disabled ? 0.5 : 1,
        },
        pressed && !disabled && { backgroundColor: theme.colors.accent },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || isPending }}
    >
      <Feather name={icon} size={16} color={theme.colors.mutedForeground} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: theme.typography.fontSize.sm.size,
            lineHeight: theme.typography.fontSize.sm.lineHeight,
            color: theme.colors.foreground,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontSize: theme.typography.fontSize.xs.size,
            lineHeight: theme.typography.fontSize.xs.lineHeight,
            color: theme.colors.mutedForeground,
          }}
        >
          {description}
        </Text>
      </View>
      {isPending ? (
        <ActivityIndicator size="small" />
      ) : (
        <Feather
          name="chevron-right"
          size={14}
          color={theme.colors.mutedForeground}
        />
      )}
    </Pressable>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: theme.spacing["8"],
    },
    intro: {
      paddingHorizontal: theme.spacing["4"],
      paddingTop: theme.spacing["3"],
      paddingBottom: theme.spacing["1"],
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
    },
    sectionItems: {
      paddingVertical: theme.spacing["1"],
    },
  } satisfies Record<string, ViewStyle | TextStyle>);
}
