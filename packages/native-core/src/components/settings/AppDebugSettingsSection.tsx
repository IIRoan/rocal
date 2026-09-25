import { useCallback, useEffect, useMemo, useState, type ComponentProps } from "react";
import {
  Alert,
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
import { useMailSkin, type MailSkin } from "../mail/mail-ui";
import { SheetGroup, SheetItem } from "../sheet/SheetSections";
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
  const skin = useMailSkin();
  const styles = useMemo(() => createStyles(theme, skin), [theme, skin]);
  const { runtime } = useAppUpdate();
  const { isAuthenticated, signOut } = useAuth();
  const [health, setHealth] = useState<HealthState>("idle");
  const [hasSessionCookie, setHasSessionCookie] = useState<boolean | null>(
    null,
  );

  const channel = formatChannelLabel(runtime.channel, runtime.appVariant);
  const variantLabel =
    runtime.appVariant === "development"
      ? runtime.appName
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

  const trailingIcon = (
    icon: ComponentProps<typeof Feather>["name"],
    color: string = skin.textSecondary,
  ) => <Feather name={icon} size={16} color={color} />;

  return (
    <SheetGroup>
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

      <SheetItem
        label="Copy diagnostics"
        detail="Variant, channel, API, session cookie"
        trailing={trailingIcon("copy")}
        onPress={onCopyDiagnostics}
      />
      <SheetItem
        label={healthLabel}
        detail={API_BASE_URL}
        trailing={trailingIcon(
          health === "ok"
            ? "check-circle"
            : health === "failed"
              ? "alert-circle"
              : "activity",
        )}
        pending={health === "checking"}
        onPress={onPingApi}
      />
      <SheetItem
        label="Clear session cookies"
        detail={
          hasSessionCookie === null
            ? "Local Better Auth jar"
            : hasSessionCookie
              ? "Session cookie present"
              : "No session cookie"
        }
        tone="destructive"
        trailing={trailingIcon("trash-2", theme.colors.destructive)}
        onPress={onClearSessionCookies}
      />
      <SheetItem
        label="Send test error"
        detail={
          getErrexReportingOptions()
            ? "Errex · errors.solace.onl/solace"
            : "DSN not configured"
        }
        trailing={trailingIcon("upload")}
        onPress={onSendTestError}
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
      color: skin.textSecondary,
    } as TextStyle,
    divider: {
      width: StyleSheet.hairlineWidth,
      backgroundColor: skin.borderPrimary,
    } as ViewStyle,
  });
}
