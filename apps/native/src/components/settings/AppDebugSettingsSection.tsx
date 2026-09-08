import { useCallback, useEffect, useMemo, useState, type ComponentProps } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { useAppUpdate } from "../../providers/AppUpdateProvider";
import { useAuth } from "../../providers/AuthProvider";
import {
  formatChannelLabel,
  formatUpdateId,
  jsSourceLabel,
  updateDiagnosticsBody,
} from "../../lib/app-update";
import { API_BASE_URL, APP_SCHEME, AUTH_STORAGE_PREFIX } from "../../lib/constants";
import {
  deleteChunkedSecureValue,
  readChunkedSecureValue,
} from "../../lib/secure-store-chunked";
import { hasSessionTokenCookie } from "../../lib/session-cookie";
import {
  captureException,
  flushReporting,
  getErrexReportingOptions,
} from "../../lib/reporting";

const COOKIE_STORE_KEY = `${AUTH_STORAGE_PREFIX}_cookie`;

type HealthState = "idle" | "checking" | "ok" | "failed";

export function AppDebugSettingsSection() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { runtime } = useAppUpdate();
  const { isAuthenticated, signOut } = useAuth();
  const [health, setHealth] = useState<HealthState>("idle");
  const [hasSessionCookie, setHasSessionCookie] = useState<boolean | null>(
    null,
  );

  const channel = formatChannelLabel(runtime.channel, runtime.appVariant);
  const variantLabel =
    runtime.appVariant === "development"
      ? "Solace Dev"
      : runtime.appVariant === "preview"
        ? "Preview"
        : "Production";

  const refreshSessionCookieFlag = useCallback(async () => {
    try {
      const raw = await readChunkedSecureValue(COOKIE_STORE_KEY);
      setHasSessionCookie(hasSessionTokenCookie(raw));
    } catch {
      setHasSessionCookie(false);
    }
  }, []);

  useEffect(() => {
    void refreshSessionCookieFlag();
  }, [refreshSessionCookieFlag]);

  const onCopyDiagnostics = () => {
    void (async () => {
      await refreshSessionCookieFlag();
      const raw = await readChunkedSecureValue(COOKIE_STORE_KEY);
      const sessionCookie = hasSessionTokenCookie(raw);
      const body = [
        updateDiagnosticsBody(runtime),
        "",
        `API: ${API_BASE_URL}`,
        `Scheme: ${APP_SCHEME}`,
        `Authenticated: ${isAuthenticated ? "yes" : "no"}`,
        `Session cookie: ${sessionCookie ? "present" : "missing"}`,
        `Source: ${jsSourceLabel(runtime)}`,
        `Update: ${formatUpdateId(runtime.updateId)}`,
      ].join("\n");
      await Clipboard.setStringAsync(body);
      Alert.alert("Copied", "Diagnostics are on the clipboard.");
    })();
  };

  const onPingApi = () => {
    void (async () => {
      setHealth("checking");
      try {
        const response = await fetch(`${API_BASE_URL}/api/health`, {
          method: "GET",
        });
        setHealth(response.ok ? "ok" : "failed");
        Alert.alert(
          response.ok ? "API reachable" : "API error",
          `${API_BASE_URL}\nHTTP ${response.status}`,
        );
      } catch (error) {
        setHealth("failed");
        Alert.alert(
          "API unreachable",
          error instanceof Error ? error.message : "Request failed.",
        );
      }
    })();
  };

  const onClearSessionCookies = () => {
    Alert.alert(
      "Clear session cookies?",
      "Removes the local Better Auth cookie jar. You will need to sign in again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await deleteChunkedSecureValue(COOKIE_STORE_KEY);
                await signOut();
                setHasSessionCookie(false);
                Alert.alert("Cleared", "Local session cookies were removed.");
              } catch (error) {
                Alert.alert(
                  "Clear failed",
                  error instanceof Error ? error.message : "Could not clear.",
                );
              }
            })();
          },
        },
      ],
    );
  };

  const onSendTestError = () => {
    if (!getErrexReportingOptions()) {
      Alert.alert(
        "Error reporting off",
        "EXPO_PUBLIC_SENTRY_DSN is not set in this build.",
      );
      return;
    }
    void (async () => {
      captureException(
        new Error(`solace native settings test ${new Date().toISOString()}`),
      );
      await flushReporting(2_000);
      Alert.alert("Sent", "Test event queued for Errex.");
    })();
  };

  const healthLabel =
    health === "checking"
      ? "Checking…"
      : health === "ok"
        ? "Reachable"
        : health === "failed"
          ? "Unreachable — try again"
          : "Ping API";

  return (
    <View style={styles.card}>
      <View style={styles.metrics}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Variant</Text>
          <Text style={styles.metricValue} numberOfLines={1}>
            {variantLabel}
          </Text>
          <Text style={styles.stamp} numberOfLines={1}>
            {channel}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>API</Text>
          <Text style={styles.metricValueSmall} numberOfLines={2}>
            {API_BASE_URL.replace(/^https?:\/\//, "")}
          </Text>
          <Text style={styles.stamp} numberOfLines={1}>
            {APP_SCHEME}://
          </Text>
        </View>
      </View>

      <DebugRow
        label="Copy diagnostics"
        detail="Variant, channel, API, session cookie"
        icon="copy"
        onPress={onCopyDiagnostics}
        styles={styles}
        theme={theme}
      />
      <DebugRow
        label={healthLabel}
        detail={API_BASE_URL}
        icon={
          health === "ok"
            ? "check-circle"
            : health === "failed"
              ? "alert-circle"
              : "activity"
        }
        onPress={onPingApi}
        busy={health === "checking"}
        styles={styles}
        theme={theme}
      />
      <DebugRow
        label="Clear session cookies"
        detail={
          hasSessionCookie === null
            ? "Local Better Auth jar"
            : hasSessionCookie
              ? "Session cookie present"
              : "No session cookie"
        }
        icon="trash-2"
        onPress={onClearSessionCookies}
        styles={styles}
        theme={theme}
        destructive
      />
      <DebugRow
        label="Send test error"
        detail={
          getErrexReportingOptions()
            ? "Errex · errors.solace.onl/solace"
            : "DSN not configured"
        }
        icon="upload"
        onPress={onSendTestError}
        styles={styles}
        theme={theme}
      />
    </View>
  );
}

function DebugRow({
  label,
  detail,
  icon,
  onPress,
  busy,
  destructive,
  styles,
  theme,
}: {
  label: string;
  detail: string;
  icon: ComponentProps<typeof Feather>["name"];
  onPress: () => void;
  busy?: boolean;
  destructive?: boolean;
  styles: ReturnType<typeof createStyles>;
  theme: ThemeTokens;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.row,
        pressed && !busy && styles.rowPressed,
        busy && styles.rowDisabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={detail}
      accessibilityState={{ disabled: Boolean(busy), busy: Boolean(busy) }}
    >
      <View style={styles.rowText}>
        <Text
          style={[styles.rowLabel, destructive && styles.destructive]}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Text style={styles.rowDetail} numberOfLines={1}>
          {detail}
        </Text>
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={theme.colors.mutedForeground} />
      ) : (
        <Feather
          name={icon}
          size={16}
          color={
            destructive ? theme.colors.destructive : theme.colors.mutedForeground
          }
        />
      )}
    </Pressable>
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
    metricValue: {
      fontFamily: theme.typography.fontFamily.mono,
      fontSize: theme.typography.fontSize.lg.size,
      lineHeight: theme.typography.fontSize.lg.lineHeight,
      color: theme.colors.foreground,
    } as TextStyle,
    metricValueSmall: {
      fontFamily: theme.typography.fontFamily.mono,
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
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
      minHeight: 48,
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
    destructive: {
      color: theme.colors.destructive,
    } as TextStyle,
  });
}
