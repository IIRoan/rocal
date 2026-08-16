import { useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Updates from "expo-updates";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { useAppUpdate } from "../../providers/AppUpdateProvider";
import {
  actionLabel,
  checkStatusDetail,
  formatChannelLabel,
  formatUpdateId,
  formatUpdateStamp,
  jsSourceLabel,
  updateDiagnosticsBody,
  updateDiagnosticsTitle,
} from "../../lib/app-update";

const EXPO_UPDATES_URL =
  "https://expo.dev/accounts/astralgrove/projects/solace/updates";

export function AppUpdateSettingsSection() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {
    enabled,
    action,
    checkStatus,
    checkError,
    check,
    install,
    restart,
    runtime,
  } = useAppUpdate();
  const channel = formatChannelLabel(runtime.channel, runtime.appVariant);
  const label = actionLabel(enabled, action, checkStatus);
  const detail = checkStatusDetail(
    enabled,
    action,
    checkStatus,
    channel,
    checkError,
  );
  const checking = checkStatus === "checking";
  const busy =
    checking || action === "downloading" || action === "restarting";
  const updateId = formatUpdateId(Updates.updateId);
  const stamp = Updates.createdAt
    ? formatUpdateStamp(Updates.createdAt)
    : jsSourceLabel(runtime);
  const isDevBuild = runtime.appVariant === "development";

  const showDiagnostics = () => {
    Alert.alert(updateDiagnosticsTitle(runtime), updateDiagnosticsBody(runtime));
  };

  const onAction = () => {
    if (busy) return;
    if (!enabled) {
      showDiagnostics();
      return;
    }
    if (action === "ready") {
      void restart();
      return;
    }
    if (action === "available" || action === "error") {
      void install();
      return;
    }
    void (async () => {
      const outcome = await check("user");
      if (outcome === "disabled" || outcome === "development-mode") {
        showDiagnostics();
      }
    })();
  };

  const accessory = checking ? (
    <ActivityIndicator size="small" color={theme.colors.mutedForeground} />
  ) : (
    <Feather
      name={
        !enabled
          ? "info"
          : action === "ready"
            ? "refresh-cw"
            : checkStatus === "current"
              ? "check"
              : checkStatus === "failed"
                ? "alert-circle"
                : "download"
      }
      size={16}
      color={theme.colors.mutedForeground}
    />
  );

  return (
    <View style={styles.card}>
      <Pressable
        onPress={showDiagnostics}
        style={({ pressed }) => [styles.metrics, pressed && styles.rowPressed]}
        accessibilityRole="button"
        accessibilityLabel={
          isDevBuild ? "Solace Dev update details" : "Update channel details"
        }
      >
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Active</Text>
          <Text style={styles.channel} numberOfLines={1}>
            {channel}
          </Text>
          {isDevBuild ? (
            <Text style={styles.stamp} numberOfLines={1}>
              Solace Dev
            </Text>
          ) : null}
        </View>
        <View style={styles.divider} />
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Update</Text>
          <Text style={styles.updateId} numberOfLines={1}>
            {updateId}
          </Text>
          <Text style={styles.stamp} numberOfLines={1}>
            {stamp}
          </Text>
        </View>
        <View style={styles.metricsInfo}>
          <Feather
            name="info"
            size={16}
            color={theme.colors.mutedForeground}
          />
        </View>
      </Pressable>

      <Pressable
        onPress={onAction}
        disabled={busy}
        style={({ pressed }) => [
          styles.row,
          pressed && !busy && styles.rowPressed,
          busy && styles.rowDisabled,
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={detail ?? undefined}
        accessibilityState={{ disabled: busy, busy }}
      >
        <View style={styles.rowText}>
          <Text style={styles.rowLabel} numberOfLines={1}>
            {label}
          </Text>
          {detail ? (
            <Text style={styles.rowDetail} numberOfLines={2}>
              {detail}
            </Text>
          ) : null}
        </View>
        {accessory}
      </Pressable>

      <Pressable
        onPress={() => {
          void Linking.openURL(EXPO_UPDATES_URL);
        }}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        accessibilityRole="link"
        accessibilityLabel="Browse Expo updates"
      >
        <Text style={styles.rowLabel} numberOfLines={1}>
          Browse Expo updates
        </Text>
        <Feather
          name="external-link"
          size={16}
          color={theme.colors.mutedForeground}
        />
      </Pressable>
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    card: {
      marginHorizontal: theme.spacing["3"],
      marginBottom: theme.spacing["2"],
      overflow: "hidden",
      borderRadius: theme.borderRadius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.card,
    } as ViewStyle,
    metrics: {
      flexDirection: "row",
      alignItems: "stretch",
    } as ViewStyle,
    metricsInfo: {
      justifyContent: "center",
      paddingRight: theme.spacing["4"],
    } as ViewStyle,
    metric: {
      flex: 1,
      minWidth: 0,
      gap: 4,
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["4"],
    } as ViewStyle,
    metricLabel: {
      fontSize: 10,
      letterSpacing: 1.4,
      textTransform: "uppercase",
      color: theme.colors.mutedForeground,
    } as TextStyle,
    channel: {
      fontFamily: theme.typography.fontFamily.mono,
      fontSize: theme.typography.fontSize["2xl"].size,
      lineHeight: theme.typography.fontSize["2xl"].lineHeight,
      fontVariant: ["tabular-nums"],
      color: theme.colors.foreground,
    } as TextStyle,
    updateId: {
      fontFamily: theme.typography.fontFamily.mono,
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      fontVariant: ["tabular-nums"],
      color: theme.colors.foreground,
    } as TextStyle,
    stamp: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
    } as TextStyle,
    divider: {
      width: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border,
    } as ViewStyle,
    row: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: theme.spacing["2"],
      paddingHorizontal: theme.spacing["4"],
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
    } as ViewStyle,
    rowPressed: {
      backgroundColor: theme.colors.accent,
    } as ViewStyle,
    rowDisabled: {
      opacity: 0.55,
    } as ViewStyle,
    rowText: {
      flex: 1,
      marginRight: theme.spacing["3"],
      gap: 2,
    } as ViewStyle,
    rowLabel: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    } as TextStyle,
    rowDetail: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
    } as TextStyle,
  });
}
