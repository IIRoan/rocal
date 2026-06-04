import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../src/providers/AuthProvider";
import {
  AUTH_SIGN_IN_ROUTE,
  CALENDAR_HOME_ROUTE,
  SETTINGS_ROUTE,
} from "../src/lib/auth-routing";
import { useTheme } from "../src/providers/ThemeProvider";
import type { ThemeTokens } from "@workspace/design-tokens";

export default function NotFoundScreen() {
  const router = useRouter();
  const { signOut, isAuthenticated } = useAuth();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = useCallback(async () => {
    setIsSigningOut(true);
    try {
      await signOut();
      router.replace(AUTH_SIGN_IN_ROUTE);
    } catch {
      // Best-effort — navigation guard will redirect anyway.
    } finally {
      setIsSigningOut(false);
    }
  }, [signOut, router]);

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.errorCode}>404</Text>
          <Text style={styles.title}>Screen not found</Text>
          <Text style={styles.subtitle}>
            The page you're looking for doesn't exist or has been moved.
          </Text>
        </View>

        {/* Navigation buttons */}
        <View style={styles.actions}>
          {/* Go to Calendar */}
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
            ]}
            onPress={() => router.replace(CALENDAR_HOME_ROUTE)}
            accessibilityRole="button"
            accessibilityLabel="Go to calendar"
          >
            <Text style={styles.primaryButtonText}>Go to Calendar</Text>
          </Pressable>

          {/* Go to Settings */}
          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.secondaryButtonPressed,
            ]}
            onPress={() => router.replace(SETTINGS_ROUTE)}
            accessibilityRole="button"
            accessibilityLabel="Go to settings"
          >
            <Text style={styles.secondaryButtonText}>Settings</Text>
          </Pressable>

          {/* Sign out */}
          {isAuthenticated && (
            <>
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.destructiveButton,
                  pressed && styles.destructiveButtonPressed,
                  isSigningOut && styles.buttonDisabled,
                ]}
                onPress={handleSignOut}
                disabled={isSigningOut}
                accessibilityRole="button"
                accessibilityLabel="Sign out"
                accessibilityState={{ disabled: isSigningOut }}
              >
                {isSigningOut ? (
                  <ActivityIndicator color={theme.colors.destructive} />
                ) : (
                  <Text style={styles.destructiveButtonText}>Sign Out</Text>
                )}
              </Pressable>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(theme: ThemeTokens) {
  const view = {
    flex: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    container: {
      flex: 1,
      justifyContent: "center" as const,
      paddingHorizontal: theme.spacing["6"],
      maxWidth: 400,
      width: "100%" as const,
      alignSelf: "center" as const,
    },
    header: {
      alignItems: "center" as const,
      marginBottom: theme.spacing["8"],
    },
    actions: {
      gap: theme.spacing["3"],
    },
    primaryButton: {
      backgroundColor: theme.colors.primaryBase,
      borderRadius: theme.borderRadius.lg,
      paddingVertical: theme.spacing["3"],
      alignItems: "center" as const,
      justifyContent: "center" as const,
      minHeight: 48,
    },
    primaryButtonPressed: {
      opacity: 0.85,
    },
    secondaryButton: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.lg,
      paddingVertical: theme.spacing["3"],
      alignItems: "center" as const,
      justifyContent: "center" as const,
      minHeight: 48,
      backgroundColor: theme.colors.background,
    },
    secondaryButtonPressed: {
      backgroundColor: theme.colors.accent,
    },
    divider: {
      marginVertical: theme.spacing["1"],
    },
    dividerLine: {
      height: 1,
      backgroundColor: theme.colors.border,
    },
    destructiveButton: {
      borderWidth: 1,
      borderColor: theme.colors.destructive + "40",
      borderRadius: theme.borderRadius.lg,
      paddingVertical: theme.spacing["3"],
      alignItems: "center" as const,
      justifyContent: "center" as const,
      minHeight: 48,
      backgroundColor: theme.colors.destructive + "10",
    },
    destructiveButtonPressed: {
      backgroundColor: theme.colors.destructive + "20",
    },
    buttonDisabled: {
      opacity: 0.6,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    errorCode: {
      fontSize: 64,
      fontWeight: theme.typography.fontWeight.bold as TextStyle["fontWeight"],
      color: theme.colors.mutedForeground + "40",
      marginBottom: theme.spacing["2"],
    },
    title: {
      fontSize: theme.typography.fontSize["2xl"].size,
      lineHeight: theme.typography.fontSize["2xl"].lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
      marginBottom: theme.spacing["2"],
    },
    subtitle: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
      textAlign: "center" as const,
    },
    primaryButtonText: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.primaryForeground,
    },
    secondaryButtonText: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    destructiveButtonText: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.destructive,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
