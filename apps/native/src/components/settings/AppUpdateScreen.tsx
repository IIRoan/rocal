import { useMemo } from "react";
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { useAppUpdate } from "../../providers/AppUpdateProvider";
import {
  copyForPhase,
  formatChannelLabel,
  formatDownloadPercent,
  type AppUpdatePhase,
} from "../../lib/app-update";

const logoSource = require("../../assets/logo.png");

export type AppUpdateDispatchProps = {
  phase: AppUpdatePhase;
  channelLabel: string;
  downloadProgress?: number;
  errorMessage?: string | null;
  onPrimary?: () => void;
  onSecondary?: () => void;
};

export function AppUpdateDispatch({
  phase,
  channelLabel,
  downloadProgress,
  errorMessage = null,
  onPrimary,
  onSecondary,
}: AppUpdateDispatchProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const copy = copyForPhase(phase, channelLabel, errorMessage);
  const percent = formatDownloadPercent(downloadProgress);
  const busy = phase === "downloading" || phase === "restarting";

  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: Math.max(insets.top, theme.spacing["4"]),
          paddingBottom: Math.max(insets.bottom, theme.spacing["4"]),
        },
      ]}
    >
      <View style={styles.center}>
        <View style={styles.brand}>
          <Image
            source={logoSource}
            style={styles.logo}
            accessibilityIgnoresInvertColors
          />
          <Text style={styles.wordmark}>SOLACE</Text>
        </View>
        {copy.kicker ? <Text style={styles.kicker}>{copy.kicker}</Text> : null}
        {copy.title ? (
          <Text style={styles.title} accessibilityRole="header">
            {copy.title}
          </Text>
        ) : null}
        {copy.body ? <Text style={styles.body}>{copy.body}</Text> : null}

        {phase === "downloading" ? (
          <View
            style={styles.progressBlock}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: percent }}
            accessibilityLabel={`Installing update, ${percent} percent`}
          >
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${percent}%` }]} />
            </View>
            <Text style={styles.percent}>{percent}%</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.actions}>
        {copy.primary ? (
          <Pressable
            onPress={onPrimary}
            disabled={busy || !onPrimary}
            style={({ pressed }) => [
              styles.primary,
              pressed && styles.primaryPressed,
              (busy || !onPrimary) && styles.disabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel={copy.primary}
          >
            <Text style={styles.primaryText}>{copy.primary}</Text>
          </Pressable>
        ) : null}
        {copy.secondary ? (
          <Pressable
            onPress={onSecondary}
            style={({ pressed }) => [
              styles.secondary,
              pressed && styles.secondaryPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={copy.secondary}
          >
            <Text style={styles.secondaryText}>{copy.secondary}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function AppUpdateScreen() {
  const {
    phase,
    channel,
    downloadProgress,
    errorMessage,
    install,
    restart,
    dismiss,
    runtime,
  } = useAppUpdate();
  const visible = phase !== "idle";

  const onPrimary = () => {
    if (phase === "available" || phase === "error") {
      void install();
      return;
    }
    if (phase === "ready") {
      void restart();
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={
        phase === "downloading" || phase === "restarting" ? undefined : dismiss
      }
    >
      <AppUpdateDispatch
        phase={phase}
        channelLabel={formatChannelLabel(channel, runtime.appVariant)}
        downloadProgress={downloadProgress}
        errorMessage={errorMessage}
        onPrimary={onPrimary}
        onSecondary={dismiss}
      />
    </Modal>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.background,
      paddingHorizontal: theme.spacing["6"],
    } as ViewStyle,
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing["3"],
    } as ViewStyle,
    brand: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing["2"],
      marginBottom: theme.spacing["3"],
    } as ViewStyle,
    logo: {
      width: 22,
      height: 22,
      borderRadius: 6,
    },
    wordmark: {
      color: theme.colors.mutedForeground,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 5,
      opacity: 0.6,
    } as TextStyle,
    kicker: {
      fontSize: 11,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      letterSpacing: 1.4,
      textTransform: "uppercase",
      color: theme.colors.mutedForeground,
    } as TextStyle,
    title: {
      fontSize: theme.typography.fontSize["3xl"].size,
      lineHeight: theme.typography.fontSize["3xl"].lineHeight,
      fontWeight: theme.typography.fontWeight.semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
      textAlign: "center",
      letterSpacing: -0.6,
    } as TextStyle,
    body: {
      maxWidth: 360,
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      color: theme.colors.mutedForeground,
      textAlign: "center",
    } as TextStyle,
    progressBlock: {
      width: "100%",
      maxWidth: 360,
      gap: theme.spacing["2"],
      marginTop: theme.spacing["2"],
    } as ViewStyle,
    track: {
      height: 2,
      borderRadius: 999,
      overflow: "hidden",
      backgroundColor: theme.colors.border,
    } as ViewStyle,
    fill: {
      height: "100%",
      backgroundColor: theme.colors.primaryBase,
      borderRadius: 999,
    } as ViewStyle,
    percent: {
      fontSize: 12,
      fontVariant: ["tabular-nums"],
      color: theme.colors.mutedForeground,
    } as TextStyle,
    actions: {
      width: "100%",
      maxWidth: 400,
      alignSelf: "center",
      gap: theme.spacing["2"],
    } as ViewStyle,
    primary: {
      minHeight: 46,
      borderRadius: theme.borderRadius.lg,
      backgroundColor: theme.colors.primaryBase,
      alignItems: "center",
      justifyContent: "center",
    } as ViewStyle,
    primaryPressed: {
      opacity: 0.9,
    } as ViewStyle,
    primaryText: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight.semibold as TextStyle["fontWeight"],
      color: theme.colors.primaryForeground,
    } as TextStyle,
    secondary: {
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
    } as ViewStyle,
    secondaryPressed: {
      opacity: 0.7,
    } as ViewStyle,
    secondaryText: {
      fontSize: theme.typography.fontSize.base.size,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    } as TextStyle,
    disabled: {
      opacity: 0.55,
    } as ViewStyle,
  });
}
