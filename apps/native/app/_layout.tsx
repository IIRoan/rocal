import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Slot, useRouter, useSegments } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import "../src/lib/install-native-crypto";
import { QueryProvider } from "../src/providers/QueryProvider";
import { AuthProvider, useAuth } from "../src/providers/AuthProvider";
import { ThemeProvider, useTheme } from "../src/providers/ThemeProvider";
import { E2eeProvider, useE2ee } from "../src/providers/E2eeProvider";
import { SheetProvider } from "../src/providers/SheetProvider";
import { SidebarProvider, useSidebar } from "../src/providers/SidebarProvider";
import { MailSelectionProvider } from "../src/providers/MailSelectionProvider";
import { CommandPaletteProvider } from "../src/providers/CommandPaletteProvider";
import { CalendarViewProvider } from "../src/providers/CalendarViewProvider";
import { AppSidebar } from "../src/components/AppSidebar";
import { CommandPalette } from "../src/components/CommandPalette";
import { calendarApiService } from "../src/lib/api";
import {
  getAuthRedirectPath,
  shouldRenderAuthenticatedChrome,
} from "../src/lib/auth-routing";
import { API_BASE_URL } from "../src/lib/constants";
import {
  prepareAuthenticatedCryptoSession,
  type StartupCryptoPhase,
} from "../src/lib/startup-crypto";

// ---------------------------------------------------------------------------
// Navigation guard — redirects based on auth state
// ---------------------------------------------------------------------------

function E2eeSetupScreen({ message }: { message: StartupCryptoPhase }) {
  const { theme } = useTheme();
  const progressTargets = useMemo<Record<StartupCryptoPhase, number>>(
    () => ({
      "Setting up encryption…": 0.14,
      "Enabling full event encryption…": 0.3,
      "Checking encrypted mail…": 0.48,
      "Generating mailbox keys…": 0.66,
      "Connecting encrypted mail…": 0.82,
      "Unlocking encrypted mail…": 0.94,
    }),
    [],
  );
  const stepOrder = useMemo<StartupCryptoPhase[]>(
    () => [
      "Enabling full event encryption…",
      "Checking encrypted mail…",
      "Generating mailbox keys…",
      "Connecting encrypted mail…",
      "Unlocking encrypted mail…",
    ],
    [],
  );
  const progress = useRef(new Animated.Value(0.1)).current;
  const [displayProgress, setDisplayProgress] = useState(10);

  useEffect(() => {
    const target = progressTargets[message] ?? 0.18;
    const listenerId = progress.addListener(({ value }) => {
      setDisplayProgress(Math.max(8, Math.round(value * 100)));
    });

    Animated.timing(progress, {
      toValue: target,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    return () => {
      progress.removeListener(listenerId);
    };
  }, [message, progress, progressTargets]);

  const barWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });
  const activeStepIndex = Math.max(
    0,
    stepOrder.findIndex((step) => step === message),
  );

  return (
    <View
      style={[
        styles.e2eeSetup,
        { backgroundColor: theme.colors.background ?? theme.colors.card },
      ]}
    >
      <View
        style={styles.e2eeSetupContent}
      >
        <View
          style={[
            styles.e2eeSetupHeaderRow,
            {
              borderBottomColor: theme.colors.border,
            },
          ]}
        >
          <Pressable
            style={styles.e2eeHeaderIcon}
            accessibilityRole="none"
            disabled
          >
            <Feather name="shield" size={20} color={theme.colors.foreground} />
          </Pressable>
          <Text
            style={[
              styles.e2eeHeaderTitle,
              {
                color: theme.colors.foreground,
                fontSize: theme.typography.fontSize.lg.size,
                lineHeight: theme.typography.fontSize.lg.lineHeight,
              },
            ]}
          >
            Preparing workspace
          </Text>
          <View style={styles.e2eeHeaderSpacer} />
        </View>

        <View style={styles.e2eeBody}>
          <Text
            style={[
              styles.e2eeSetupText,
              {
                color: theme.colors.mutedForeground,
                fontSize: theme.typography.fontSize.sm.size,
                lineHeight: theme.typography.fontSize.sm.lineHeight,
              },
            ]}
          >
            {message}
          </Text>

          <View style={styles.e2eeProgressMeta}>
            <Text
              style={[
                styles.e2eeProgressLabel,
                {
                  color: theme.colors.mutedForeground,
                  fontSize: theme.typography.fontSize.xs.size,
                },
              ]}
            >
              Encryption setup
            </Text>
            <Text
              style={[
                styles.e2eeProgressValue,
                {
                  color: theme.colors.foreground,
                  fontSize: theme.typography.fontSize.xs.size,
                },
              ]}
            >
              {displayProgress}%
            </Text>
          </View>

          <View
            style={[
              styles.e2eeProgressTrack,
              { backgroundColor: `${theme.colors.border}88` },
            ]}
          >
            <Animated.View
              style={[
                styles.e2eeProgressFill,
                { backgroundColor: theme.colors.primaryBase, width: barWidth },
              ]}
            />
          </View>

          <View
            style={[
              styles.e2eeSteps,
              {
                borderTopColor: theme.colors.border + "88",
              },
            ]}
          >
            {stepOrder.map((step, index) => {
              const isComplete = index < activeStepIndex;
              const isActive = step === message;
              return (
                <View key={step} style={styles.e2eeStepRow}>
                  <View
                    style={[
                      styles.e2eeStepMarker,
                      {
                        borderColor: isComplete || isActive
                          ? theme.colors.primaryBase
                          : theme.colors.border,
                        backgroundColor: isComplete
                          ? theme.colors.primaryBase
                          : isActive
                            ? `${theme.colors.primaryBase}20`
                            : "transparent",
                      },
                    ]}
                  >
                    {isComplete ? (
                      <Feather
                        name="check"
                        size={10}
                        color={theme.colors.primaryForeground}
                      />
                    ) : (
                      <View
                        style={[
                          styles.e2eeStepInnerDot,
                          {
                            backgroundColor: isActive
                              ? theme.colors.primaryBase
                              : "transparent",
                          },
                        ]}
                      />
                    )}
                  </View>
                  <Text
                    style={[
                      styles.e2eeStepText,
                      {
                        color: isActive
                          ? theme.colors.foreground
                          : theme.colors.mutedForeground,
                        fontSize: theme.typography.fontSize.xs.size,
                      },
                    ]}
                  >
                    {step.replace(/…$/, "")}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

function NavigationGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { isReady: isE2eeReady, bootstrap, clearSession, provider } = useE2ee();
  const queryClient = useQueryClient();
  const segments = useSegments();
  const router = useRouter();
  const [isPreparingStartupCrypto, setIsPreparingStartupCrypto] = useState(false);
  const [setupMessage, setSetupMessage] = useState<StartupCryptoPhase>(
    "Setting up encryption…",
  );

  // Redirect based on auth state.
  useEffect(() => {
    const redirectPath = getAuthRedirectPath({
      isAuthenticated,
      isLoading,
      segments,
    });
    if (!redirectPath) return;

    const timeoutId = setTimeout(() => {
      router.replace(redirectPath);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [isAuthenticated, isLoading, segments, router]);

  // Bootstrap E2EE after authentication.
  useEffect(() => {
    calendarApiService.setE2eeProvider(provider);

    if (!isAuthenticated || !user) {
      setIsPreparingStartupCrypto(false);
      setSetupMessage("Setting up encryption…");
      clearSession();
      return;
    }

    let cancelled = false;
    setIsPreparingStartupCrypto(true);
    setSetupMessage("Setting up encryption…");

    (async () => {
      await bootstrap(user.id, API_BASE_URL);
      if (cancelled) return;

      await prepareAuthenticatedCryptoSession({
        queryClient,
        userId: user.id,
        email: user.email,
        displayName: user.name,
        onPhaseChange: (phase) => {
          if (!cancelled) {
            setSetupMessage(phase);
          }
        },
      });
    })()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setIsPreparingStartupCrypto(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user, bootstrap, clearSession, provider, queryClient]);

  // Block the main app until E2EE is ready so keys are generated before the
  // user reaches any screen that reads or writes encrypted content.
  if (
    isAuthenticated &&
    !isLoading &&
    (!isE2eeReady || isPreparingStartupCrypto)
  ) {
    return <E2eeSetupScreen message={setupMessage} />;
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  e2eeSetup: {
    flex: 1,
    justifyContent: "center",
  },
  e2eeSetupContent: {
    flex: 1,
    justifyContent: "center",
  },
  e2eeSetupHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  e2eeHeaderIcon: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  e2eeHeaderTitle: {
    flex: 1,
    textAlign: "center",
    fontWeight: "600",
  },
  e2eeHeaderSpacer: {
    minWidth: 36,
  },
  e2eeBody: {
    paddingHorizontal: 20,
    paddingTop: 28,
    gap: 18,
  },
  e2eeSetupText: {
    letterSpacing: 0.1,
    lineHeight: 20,
  },
  e2eeProgressMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  e2eeProgressLabel: {
    fontWeight: "500",
  },
  e2eeProgressValue: {
    fontWeight: "700",
  },
  e2eeProgressTrack: {
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
  },
  e2eeProgressFill: {
    height: "100%",
    borderRadius: 999,
  },
  e2eeSteps: {
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  e2eeStepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  e2eeStepMarker: {
    width: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  e2eeStepInnerDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  e2eeStepText: {
    flex: 1,
  },
});

function AuthenticatedChrome() {
  const { isAuthenticated, isLoading } = useAuth();
  const { isOpen, close } = useSidebar();
  const segments = useSegments();
  const showChrome = shouldRenderAuthenticatedChrome({
    isAuthenticated,
    isLoading,
    segments,
  });

  useEffect(() => {
    if (!showChrome && isOpen) {
      close();
    }
  }, [close, isOpen, showChrome]);

  if (!showChrome) {
    return null;
  }

  return (
    <>
      <AppSidebar />
      <CommandPalette />
    </>
  );
}

// ---------------------------------------------------------------------------
// Root layout
// ---------------------------------------------------------------------------

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryProvider>
        <AuthProvider>
          <ThemeProvider>
            <E2eeProvider>
              <SidebarProvider>
                <MailSelectionProvider>
                  <CalendarViewProvider>
                    <NavigationGuard>
                      <SheetProvider>
                        <CommandPaletteProvider>
                          <Slot />
                          <AuthenticatedChrome />
                        </CommandPaletteProvider>
                      </SheetProvider>
                    </NavigationGuard>
                  </CalendarViewProvider>
                </MailSelectionProvider>
              </SidebarProvider>
            </E2eeProvider>
          </ThemeProvider>
        </AuthProvider>
      </QueryProvider>
    </GestureHandlerRootView>
  );
}
