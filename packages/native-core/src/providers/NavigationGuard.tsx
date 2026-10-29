import { useEffect, useReducer, type ReactNode } from "react";
import { View } from "react-native";
import { useRouter, useSegments } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./AuthProvider";
import { useE2ee } from "./E2eeProvider";
import { PushNotificationNavigation } from "./PushNotificationNavigation";
import { E2eeUnlockSheet } from "../components/E2eeUnlockSheet";
import { WorkspaceLoadingScreen } from "../components/WorkspaceLoadingScreen";
import { calendarApiService } from "../lib/api";
import { QUERY_KEYS } from "../lib/query-keys";
import {
  getAuthRedirectPath,
  shouldRenderAuthenticatedChrome,
} from "../lib/auth-routing";
import { API_BASE_URL } from "../lib/constants";
import { hideLaunchSplash } from "../lib/launch-splash";
import { resetPreSessionQueries } from "../lib/session-query-reset";
import { restoreWithTimeout } from "../lib/session-restore";
import {
  useNotificationExtensionSync,
  type NotificationExtensionSecrets,
} from "../hooks/use-notification-extension-sync";
import { useAccountTimezoneSeed } from "../hooks/use-account-timezone-seed";
import {
  STARTUP_CRYPTO_INITIAL_PHASE,
  type AuthenticatedSessionInput,
} from "../lib/startup-crypto";
import type { PushTapHandler } from "../lib/push-notifications";

export interface NavigationGuardProps {
  children: ReactNode;
  /** The app's signed-in landing route. */
  homeRoute: string;
  /** App-specific startup after the E2EE session is ready (mailbox unlock). */
  prepareSession?: (input: AuthenticatedSessionInput) => Promise<void>;
  /** Seeds the cache from an encrypted on-device copy; resolving true skips the loading screen while startup runs behind the app. */
  restoreSession?: (
    input: Pick<
      AuthenticatedSessionInput,
      "queryClient" | "userId" | "isCancelled"
    >,
  ) => Promise<boolean>;
  pushTapHandler: PushTapHandler;
  notificationExtensionSecrets: NotificationExtensionSecrets;
}

interface StartupState {
  /** Signed-in user this startup belongs to; a different user resets it during render. */
  userId: string | null;
  isPreparing: boolean;
  message: string;
  restored: boolean | null;
}

type StartupAction =
  | { type: "reset"; userId: string | null }
  | { type: "started" }
  | { type: "restored"; userId: string; restored: boolean }
  | { type: "phase"; message: string }
  | { type: "finished" };

function initialStartup(userId: string | null): StartupState {
  return {
    userId,
    isPreparing: false,
    message: STARTUP_CRYPTO_INITIAL_PHASE,
    restored: null,
  };
}

function startupReducer(
  state: StartupState,
  action: StartupAction,
): StartupState {
  switch (action.type) {
    case "reset":
      return initialStartup(action.userId);
    case "started":
      return {
        ...state,
        isPreparing: true,
        message: STARTUP_CRYPTO_INITIAL_PHASE,
      };
    case "restored":
      return action.userId === state.userId
        ? { ...state, restored: action.restored }
        : state;
    case "phase":
      return { ...state, message: action.message };
    case "finished":
      return { ...state, isPreparing: false };
  }
}

/** Shared auth gate: redirects by session state and blocks the UI while E2EE and app startup run. */
export function NavigationGuard({
  children,
  homeRoute,
  prepareSession,
  restoreSession,
  pushTapHandler,
  notificationExtensionSecrets,
}: NavigationGuardProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { isReady: isE2eeReady, bootstrap, clearSession, provider } = useE2ee();
  useNotificationExtensionSync(notificationExtensionSecrets);
  useAccountTimezoneSeed(isAuthenticated && Boolean(user));
  const queryClient = useQueryClient();
  const segments = useSegments();
  const { replace } = useRouter();
  const sessionUserId = isAuthenticated && user ? user.id : null;
  const [startup, dispatchStartup] = useReducer(
    startupReducer,
    sessionUserId,
    initialStartup,
  );
  if (startup.userId !== sessionUserId) {
    dispatchStartup({ type: "reset", userId: sessionUserId });
  }
  // Bumped after the encryption password unlocks this device, so startup runs again with the account key.
  const [startupRun, rerunStartup] = useReducer((run: number) => run + 1, 0);
  const isRestorePending =
    Boolean(restoreSession) &&
    sessionUserId !== null &&
    startup.restored === null;
  const isRestored = startup.restored === true;

  // The splash covers the short restore so neither the loading screen nor an empty inbox flashes first.
  useEffect(() => {
    if (isLoading || isRestorePending) return;
    hideLaunchSplash();
  }, [isLoading, isRestorePending]);

  useEffect(() => {
    const redirectPath = getAuthRedirectPath({
      isAuthenticated,
      isLoading,
      segments,
      homeRoute,
    });
    if (!redirectPath) return;

    const timeoutId = setTimeout(() => {
      replace(redirectPath as never);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [homeRoute, isAuthenticated, isLoading, segments, replace]);

  useEffect(() => {
    calendarApiService.setE2eeProvider(provider);

    if (!isAuthenticated || !user) {
      clearSession();
      return;
    }

    let cancelled = false;
    dispatchStartup({ type: "started" });

    (async () => {
      if (restoreSession) {
        const restored = await restoreWithTimeout(
          (isCancelled) =>
            restoreSession({ queryClient, userId: user.id, isCancelled }),
          () => cancelled,
        );
        if (cancelled) return;
        dispatchStartup({ type: "restored", userId: user.id, restored });
      }

      const needsPassword = await bootstrap(user.id, API_BASE_URL);
      if (cancelled || needsPassword) return;

      await prepareSession?.({
        queryClient,
        userId: user.id,
        email: user.email,
        displayName: user.name,
        onPhaseChange: (phase) => {
          if (!cancelled) {
            dispatchStartup({ type: "phase", message: phase });
          }
        },
        isCancelled: () => cancelled,
      });

      if (cancelled) return;

      // repo-rules-allow async-promise-handling: resetPreSessionQueries is Promise.all of resetQueries, which never rejects.
      void resetPreSessionQueries(queryClient);

      // Silent on failure; the next launch retries the seed.
      void calendarApiService
        .ensureDefaultCalendars()
        .then(async (seeded) => {
          if (seeded && !cancelled) {
            await queryClient.invalidateQueries({
              queryKey: QUERY_KEYS.calendars(),
            });
          }
        })
        .catch(() => undefined);
    })()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          dispatchStartup({ type: "finished" });
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
    restoreSession,
    startupRun,
  ]);

  const isStartupRunning = !isE2eeReady || startup.isPreparing;
  // Cover the still-mounted navigator so sign-in stays put during passkey and the home screen never flashes underneath.
  const isPreparingWorkspace =
    isAuthenticated &&
    !isLoading &&
    !isRestorePending &&
    !isRestored &&
    isStartupRunning;
  // Push taps can open content that needs decryption, so they still wait for the real startup.
  const isPushNavigationReady =
    isAuthenticated && !isLoading && !isStartupRunning;

  return (
    <View style={{ flex: 1 }}>
      {children}
      <PushNotificationNavigation
        navigationReady={isPushNavigationReady}
        handler={pushTapHandler}
      />
      <WorkspaceLoadingScreen
        active={isPreparingWorkspace}
        message={startup.message}
      />
      <E2eeUnlockSheet onUnlocked={rerunStartup} />
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
