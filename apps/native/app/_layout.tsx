import { useEffect } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import { QueryProvider } from "../src/providers/QueryProvider";
import { AuthProvider, useAuth } from "../src/providers/AuthProvider";
import { ThemeProvider } from "../src/providers/ThemeProvider";
import { E2eeProvider, useE2ee } from "../src/providers/E2eeProvider";
import { calendarApiService } from "../src/lib/api";
import { API_BASE_URL } from "../src/lib/constants";

// ---------------------------------------------------------------------------
// Navigation guard — redirects based on auth state
// ---------------------------------------------------------------------------

function NavigationGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { bootstrap, provider } = useE2ee();
  const segments = useSegments();
  const router = useRouter();

  // Redirect based on auth state.
  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!isAuthenticated && !inAuthGroup) {
      // Not signed in — redirect to sign-in.
      router.replace("/(auth)/sign-in");
    } else if (isAuthenticated && inAuthGroup) {
      // Signed in — redirect to main tabs.
      // Use setTimeout to ensure the navigation state is settled before
      // attempting the redirect (Expo Router needs a tick to process
      // the auth state change).
      setTimeout(() => {
        router.replace("/(tabs)/calendar");
      }, 0);
    }
  }, [isAuthenticated, isLoading, segments, router]);

  // Bootstrap E2EE after authentication.
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    // Wire the E2EE provider into the API service.
    calendarApiService.setE2eeProvider(provider);

    // Kick off E2EE bootstrap (non-blocking).
    bootstrap(user.id, API_BASE_URL).catch(() => {
      // Bootstrap failure is non-fatal — the app works without E2EE.
    });
  }, [isAuthenticated, user, bootstrap, provider]);

  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Root layout
// ---------------------------------------------------------------------------

export default function RootLayout() {
  return (
    <QueryProvider>
      <AuthProvider>
        <ThemeProvider>
          <E2eeProvider>
            <NavigationGuard>
              <Slot />
            </NavigationGuard>
          </E2eeProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryProvider>
  );
}
