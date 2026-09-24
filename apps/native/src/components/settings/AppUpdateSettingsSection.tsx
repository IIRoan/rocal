import { useMemo } from "react";
import {
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
import { useMailSkin, type MailSkin } from "../mail/mail-ui";
import { SheetGroup, SheetItem } from "../sheet/SheetSections";
import { useAppUpdate } from "../../providers/AppUpdateProvider";
import {
  actionLabel,
  checkStatusDetail,
  formatChannelLabel,
  formatUpdateId,
  formatUpdateStamp,
  jsSourceLabel,
  presentUpdateCheckAlert,
  updateAccessoryIcon,
  updateDiagnosticsBody,
  updateDiagnosticsTitle,
} from "../../lib/app-update";

const EXPO_UPDATES_URL =
  "https://expo.dev/accounts/astralgrove/projects/solace/updates";

export function AppUpdateSettingsSection() {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const styles = useMemo(() => createStyles(theme, skin), [theme, skin]);
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
      presentUpdateCheckAlert(outcome, {
        showDiagnostics,
        install: () => void install(),
        alert: Alert.alert,
      });
    })();
  };

  return (
    <SheetGroup>
      <Pressable
        onPress={showDiagnostics}
        style={({ pressed }) => [styles.metrics, pressed && styles.rowPressed]}
        accessibilityRole="button"
        accessibilityLabel={
          isDevBuild ? "Solace Dev update details" : "Update channel details"
        }
      >
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Channel</Text>
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
          <Text style={styles.metricLabel}>Bundle</Text>
          <Text style={styles.updateId} numberOfLines={1}>
            {updateId}
          </Text>
          <Text style={styles.stamp} numberOfLines={1}>
            {stamp}
          </Text>
        </View>
      </Pressable>

      <SheetItem
        label={label}
        detail={
          detail ??
          (enabled
            ? `Looks for a newer bundle on ${channel}.`
            : "Updates are off in this session.")
        }
        trailing={
          <Feather
            name={updateAccessoryIcon(enabled, action, checkStatus)}
            size={16}
            color={skin.textSecondary}
          />
        }
        pending={checking}
        disabled={busy}
        onPress={onAction}
      />

      <SheetItem
        label="Browse Expo updates"
        trailing={
          <Feather name="external-link" size={16} color={skin.textSecondary} />
        }
        onPress={() => {
          void Linking.openURL(EXPO_UPDATES_URL);
        }}
        accessibilityRole="link"
        accessibilityLabel="Browse Expo updates"
      />
    </SheetGroup>
  );
}

function createStyles(theme: ThemeTokens, skin: MailSkin) {
  return StyleSheet.create({
    metrics: {
      flexDirection: "row",
      alignItems: "stretch",
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
      color: skin.textTertiary,
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
      color: skin.textSecondary,
    } as TextStyle,
    divider: {
      width: StyleSheet.hairlineWidth,
      backgroundColor: skin.borderPrimary,
    } as ViewStyle,
    rowPressed: {
      backgroundColor: skin.selected,
    } as ViewStyle,
  });
}
