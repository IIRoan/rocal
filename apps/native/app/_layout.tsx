import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import "../src/lib/install-native-crypto";
import { QueryProvider } from "../src/providers/QueryProvider";
import { AuthProvider, useAuth } from "../src/providers/AuthProvider";
import { ThemeProvider } from "../src/providers/ThemeProvider";
import { AppUpdateProvider } from "../src/providers/AppUpdateProvider";
import { AppUpdateScreen } from "../src/components/settings/AppUpdateScreen";
import { E2eeProvider, useE2ee } from "../src/providers/E2eeProvider";
import { SheetProvider } from "../src/providers/SheetProvider";
import { ToastProvider } from "../src/providers/ToastProvider";
import { SidebarProvider, useSidebar } from "../src/providers/SidebarProvider";
import { MailSelectionProvider } from "../src/providers/MailSelectionProvider";
import { CommandPaletteProvider } from "../src/providers/CommandPaletteProvider";
import { CalendarViewProvider } from "../src/providers/CalendarViewProvider";
import { AppSidebar } from "../src/components/AppSidebar";
import { CommandPalette } from "../src/components/CommandPalette";
import { WorkspaceLoadingScreen } from "../src/components/WorkspaceLoadingScreen";
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
import {
  NATIVE_ROOT_NON_GESTURE_SCREEN_OPTIONS,
  NATIVE_STACK_SCREEN_OPTIONS,
} from "../src/lib/navigation-routes";

// ---------------------------------------------------------------------------
// Navigation guard — redirects based on auth state
// ---------------------------------------------------------------------------
function NavigationGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { isReady: isE2eeReady, bootstrap, clearSession, provider } = useE2ee();
  const queryClient = useQueryClient();
  const segments = useSegments();
  const router = useRouter();
  const [isPreparingStartupCrypto, setIsPreparingStartupCrypto] =
    useState(false);
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

      if (cancelled) return;

      queryClient.removeQueries({ queryKey: ["events"] });
      queryClient.removeQueries({ queryKey: ["calendars"] });
      queryClient.removeQueries({ queryKey: ["categories"] });
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

  // Gate the main app until E2EE is ready so keys are generated before the
  // user reaches any screen that reads or writes encrypted content. Children
  // mount only once the gate clears; the loading layer then fades out on top
  // of them for a smooth hand-off to the app.
  const isPreparingWorkspace =
    isAuthenticated && !isLoading && (!isE2eeReady || isPreparingStartupCrypto);

  return (
    <View style={{ flex: 1 }}>
      {!isPreparingWorkspace && children}
      <WorkspaceLoadingScreen
        active={isPreparingWorkspace}
        message={setupMessage}
      />
    </View>
  );
}

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
            <AppUpdateProvider>
              <AppUpdateScreen />
              <E2eeProvider>
                <SidebarProvider>
                  <MailSelectionProvider>
                    <CalendarViewProvider>
                      <NavigationGuard>
                        <ToastProvider>
                          <SheetProvider>
                            <CommandPaletteProvider>
                              <Stack
                                screenOptions={NATIVE_STACK_SCREEN_OPTIONS}
                              >
                                <Stack.Screen
                                  name="index"
                                  options={
                                    NATIVE_ROOT_NON_GESTURE_SCREEN_OPTIONS
                                  }
                                />
                                <Stack.Screen
                                  name="(auth)"
                                  options={
                                    NATIVE_ROOT_NON_GESTURE_SCREEN_OPTIONS
                                  }
                                />
                                <Stack.Screen
                                  name="(tabs)"
                                  options={
                                    NATIVE_ROOT_NON_GESTURE_SCREEN_OPTIONS
                                  }
                                />
                              </Stack>
                              <AuthenticatedChrome />
                            </CommandPaletteProvider>
                          </SheetProvider>
                        </ToastProvider>
                      </NavigationGuard>
                    </CalendarViewProvider>
                  </MailSelectionProvider>
                </SidebarProvider>
              </E2eeProvider>
            </AppUpdateProvider>
          </ThemeProvider>
        </AuthProvider>
      </QueryProvider>
    </GestureHandlerRootView>
  );
}
