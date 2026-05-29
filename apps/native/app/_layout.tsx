import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useEffect } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import { QueryProvider } from "../src/providers/QueryProvider";
import { AuthProvider, useAuth } from "../src/providers/AuthProvider";
import { ThemeProvider } from "../src/providers/ThemeProvider";
import { E2eeProvider, useE2ee } from "../src/providers/E2eeProvider";
import { SheetProvider } from "../src/providers/SheetProvider";
import { SidebarProvider } from "../src/providers/SidebarProvider";
import { MailSelectionProvider } from "../src/providers/MailSelectionProvider";
import { CommandPaletteProvider } from "../src/providers/CommandPaletteProvider";
import { CalendarViewProvider } from "../src/providers/CalendarViewProvider";
import { AppSidebar } from "../src/components/AppSidebar";
import { CommandPalette } from "../src/components/CommandPalette";
import { calendarApiService } from "../src/lib/api";
import { getAuthRedirectPath } from "../src/lib/auth-routing";
import { API_BASE_URL } from "../src/lib/constants";

// ---------------------------------------------------------------------------
// Navigation guard — redirects based on auth state
// ---------------------------------------------------------------------------

function NavigationGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { bootstrap, clearSession, provider } = useE2ee();
  const segments = useSegments();
  const router = useRouter();

  // Redirect based on auth state.
  useEffect(() => {
    const redirectPath = getAuthRedirectPath({
      isAuthenticated,
      isLoading,
      segments,
    });
    if (!redirectPath) return;

    // Expo Router can ignore redirects triggered during the same auth-state
    // transition, so defer to the next tick.
    const timeoutId = setTimeout(() => {
      router.replace(redirectPath);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [isAuthenticated, isLoading, segments, router]);

  // Bootstrap E2EE after authentication.
  useEffect(() => {
    // Wire the E2EE provider into the API service.
    calendarApiService.setE2eeProvider(provider);

    if (!isAuthenticated || !user) {
      clearSession();
      return;
    }

    // Kick off E2EE bootstrap (non-blocking).
    bootstrap(user.id, API_BASE_URL).catch(() => {
      // Bootstrap failure is non-fatal — the app works without E2EE.
    });
  }, [isAuthenticated, user, bootstrap, clearSession, provider]);

  return <>{children}</>;
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
                          <AppSidebar />
                          <CommandPalette />
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
