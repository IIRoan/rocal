/**
 * Shared loading primitives used across the app to standardize loading states.
 *
 * - LoadingScreen  — full-page gate (SafeAreaView + centered spinner + optional label)
 * - CenteredLoader — spinner centered inside any flex container
 * - InlineLoader   — horizontal row with a small spinner + optional label
 */
import { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ThemeTokens } from "@workspace/design-tokens";

// ─── LoadingScreen ────────────────────────────────────────────────────────────

interface LoadingScreenProps {
  message?: string;
  theme: ThemeTokens;
}

/**
 * Full-page loading state. Use as an early return when an entire screen is
 * waiting for initial data.
 *
 * @example
 * if (isLoading) return <LoadingScreen theme={theme} message="Loading settings…" />;
 */
export function LoadingScreen({ message, theme }: LoadingScreenProps) {
  const styles = useMemo(() => createLoadingScreenStyles(theme), [theme]);
  return (
    <SafeAreaView style={styles.container}>
      <ActivityIndicator size="large" color={theme.colors.primaryBase} />
      {message ? <Text style={styles.label}>{message}</Text> : null}
    </SafeAreaView>
  );
}

function createLoadingScreenStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing["3"],
      backgroundColor: theme.colors.background,
    },
    label: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
    },
  });
}

// ─── CenteredLoader ───────────────────────────────────────────────────────────

interface CenteredLoaderProps {
  message?: string;
  size?: "small" | "large";
  color?: string;
  theme: ThemeTokens;
}

/**
 * Centered spinner inside a flex container. Use inside scroll views, bottom
 * sheets, or partial content areas that are waiting for data.
 *
 * @example
 * {isDecrypting && <CenteredLoader theme={theme} message="Decrypting message…" />}
 */
export function CenteredLoader({
  message,
  size = "large",
  color,
  theme,
}: CenteredLoaderProps) {
  const styles = useMemo(() => createCenteredLoaderStyles(theme), [theme]);
  return (
    <View style={styles.container}>
      <ActivityIndicator
        size={size}
        color={color ?? theme.colors.primaryBase}
      />
      {message ? <Text style={styles.label}>{message}</Text> : null}
    </View>
  );
}

function createCenteredLoaderStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing["3"],
    },
    label: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
    },
  });
}

// ─── InlineLoader ─────────────────────────────────────────────────────────────

interface InlineLoaderProps {
  message?: string;
  color?: string;
  theme: ThemeTokens;
}

/**
 * Horizontal loading row with a small spinner and optional text. Use inside
 * list sections or settings rows while a sub-resource loads.
 *
 * @example
 * {subscriptionsLoading && <InlineLoader theme={theme} message="Loading subscriptions…" />}
 */
export function InlineLoader({ message, color, theme }: InlineLoaderProps) {
  const styles = useMemo(() => createInlineLoaderStyles(theme), [theme]);
  return (
    <View style={styles.container}>
      <ActivityIndicator
        size="small"
        color={color ?? theme.colors.primaryBase}
      />
      {message ? <Text style={styles.label}>{message}</Text> : null}
    </View>
  );
}

function createInlineLoaderStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing["2"],
      paddingVertical: theme.spacing["2"],
    },
    label: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
    },
  });
}
