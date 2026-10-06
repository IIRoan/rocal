/** Shared loading primitives: full-page gate, flex-centered spinner, inline row. */
import { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ThemeTokens } from "@workspace/design-tokens";

interface LoadingScreenProps {
  message?: string;
  theme: ThemeTokens;
}

/** Full-page gate; return early with it while a whole screen waits for data. */
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

interface CenteredLoaderProps {
  message?: string;
  size?: "small" | "large";
  color?: string;
  theme: ThemeTokens;
}

/** Centered spinner for flex containers (scroll views, sheets) waiting on data. */
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

interface InlineLoaderProps {
  message?: string;
  color?: string;
  theme: ThemeTokens;
}

/** Horizontal spinner + optional text for list sections while a sub-resource loads. */
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
