import { useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";
import { useRouter, useSegments } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./AuthProvider";
import { useE2ee } from "./E2eeProvider";
import { PushNotificationNavigation } from "./PushNotificationNavigation";
import { WorkspaceLoadingScreen } from "../components/WorkspaceLoadingScreen";
import { calendarApiService } from "../lib/api";
import { QUERY_KEYS } from "../lib/query-keys";
import {
  getAuthRedirectPath,
  shouldRenderAuthenticatedChrome,
} from "../lib/auth-routing";
import { API_BASE_URL } from "../lib/constants";
import { captureException } from "../lib/reporting";
import { resetPreSessionQueries } from "../lib/session-query-reset";
import {
  useNotificationExtensionSync,
  type NotificationExtensionSecrets,
} from "../hooks/use-notification-extension-sync";
import {
  STARTUP_CRYPTO_INITIAL_PHASE,
  type AuthenticatedSessionInput,
} from "../lib/startup-crypto";
import type { PushTapHandler } from "../lib/push-notifications";

export interface NavigationGuardProps {
  children: ReactNode;
  /** The app's signed-in landing route. */
  homeRoute: string;
  /** App-specific startup after the E2EE session is ready (encryption checks, mailbox unlock). */
  prepareSession: (input: AuthenticatedSessionInput) => Promise<void>;
  pushTapHandler: PushTapHandler;
  notificationExtensionSecrets: NotificationExtensionSecrets;
}

/** Shared auth gate: redirects by session state and blocks the UI while E2EE and app startup run. */
export function NavigationGuard({
  children,
  homeRoute,
  prepareSession,
  pushTapHandler,
  notificationExtensionSecrets,
}: NavigationGuardProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { isReady: isE2eeReady, bootstrap, clearSession, provider } = useE2ee();
  useNotificationExtensionSync(notificationExtensionSecrets);
  const queryClient = useQueryClient();
  const segments = useSegments();
  const router = useRouter();
  const [isPreparingStartupCrypto, setIsPreparingStartupCrypto] =
    useState(false);
  const [setupMessage, setSetupMessage] = useState(STARTUP_CRYPTO_INITIAL_PHASE);

  useEffect(() => {
    const redirectPath = getAuthRedirectPath({
      isAuthenticated,
      isLoading,
      segments,
      homeRoute,
    });
    if (!redirectPath) return;

    const timeoutId = setTimeout(() => {
      router.replace(redirectPath as never);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [homeRoute, isAuthenticated, isLoading, segments, router]);

  useEffect(() => {
    calendarApiService.setE2eeProvider(provider);

    if (!isAuthenticated || !user) {
      setIsPreparingStartupCrypto(false);
      setSetupMessage(STARTUP_CRYPTO_INITIAL_PHASE);
      clearSession();
      return;
    }

    let cancelled = false;
    setIsPreparingStartupCrypto(true);
    setSetupMessage(STARTUP_CRYPTO_INITIAL_PHASE);

    (async () => {
      await bootstrap(user.id, API_BASE_URL);
      if (cancelled) return;

      await prepareSession({
        queryClient,
        userId: user.id,
        email: user.email,
        displayName: user.name,
        onPhaseChange: (phase) => {
          if (!cancelled) {
            setSetupMessage(phase);
          }
        },
        isCancelled: () => cancelled,
      });

      if (cancelled) return;

      void resetPreSessionQueries(queryClient);

      // Silent on failure; the next launch retries the remaining rows.
      void calendarApiService
        .backfillEncryptedNames()
        .then((result) => {
          if (cancelled) return;
          if (result.calendars > 0) {
            void queryClient.invalidateQueries({
              queryKey: QUERY_KEYS.calendars(),
            });
          }
          if (result.categories > 0) {
            void queryClient.invalidateQueries({
              queryKey: QUERY_KEYS.categories(),
            });
          }
        })
        .catch(() => undefined);
    })()
      .catch((error) => {
        captureException(error, {
          tags: { area: "startup-crypto" },
        });
      })
      .finally(() => {
        if (!cancelled) {
          setIsPreparingStartupCrypto(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    isAuthenticated,
    user,
    bootstrap,
    clearSession,
    prepareSession,
    provider,
    queryClient,
  ]);

  // Cover the still-mounted navigator so sign-in stays put during passkey and the home screen never flashes underneath.
  const isPreparingWorkspace =
    isAuthenticated && !isLoading && (!isE2eeReady || isPreparingStartupCrypto);
  const isPushNavigationReady =
    isAuthenticated && !isLoading && !isPreparingWorkspace;

  return (
    <View style={{ flex: 1 }}>
      {children}
      <PushNotificationNavigation
        navigationReady={isPushNavigationReady}
        handler={pushTapHandler}
      />
      <WorkspaceLoadingScreen
        active={isPreparingWorkspace}
        message={setupMessage}
      />
    </View>
  );
}

/** Renders app chrome (command palette) only on signed-in app routes. */
export function AuthenticatedChrome({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const showChrome = shouldRenderAuthenticatedChrome({
    isAuthenticated,
    isLoading,
    segments,
  });

  if (!showChrome) {
    return null;
  }

  return <>{children}</>;
}
