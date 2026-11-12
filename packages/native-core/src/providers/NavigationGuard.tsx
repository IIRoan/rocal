import { useEffect, useReducer, type ReactNode } from "react";
import { View } from "react-native";
import { useRouter, useSegments } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { createLogger } from "@workspace/logger";
import { upgradeStoredEncryption } from "@workspace/calendar-client";
import {
  SIGN_IN_TO_UNLOCK_NOTICE,
  UNLOCK_FAILED_NOTICE,
} from "@workspace/calendar-core/product-info";
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
  retrySessionStartup,
  type AuthenticatedSessionInput,
} from "../lib/startup-crypto";
import type { PushTapHandler } from "../lib/push-notifications";

const log = createLogger("native:navigation-guard");

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

function WorkspaceContent({
  blocked,
  children,
}: {
  blocked: boolean;
  children: ReactNode;
}) {
  return (
    <View
      style={{ flex: 1 }}
      accessibilityElementsHidden={blocked}
      importantForAccessibility={blocked ? "no-hide-descendants" : "auto"}
      pointerEvents={blocked ? "none" : "auto"}
    >
      {children}
    </View>
  );
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
  const { isAuthenticated, isLoading, user, signOut } = useAuth();
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
    let restoreAttempted = false;
    let encryptionReady = false;
    let restoreRetired = false;

    const initializeSession = async () => {
      dispatchStartup({ type: "started" });
      if (restoreSession && !restoreAttempted) {
        restoreAttempted = true;
        // Live preparation or a lock's sign-out owns the vault lock and caches from then on, so a snapshot must never land after that.
        const restore = restoreWithTimeout(
          (isCancelled) =>
            restoreSession({ queryClient, userId: user.id, isCancelled }),
          () => cancelled || restoreRetired,
        );
        const restored = await restore.inTime;
        if (cancelled) return;
        dispatchStartup({ type: "restored", userId: user.id, restored });
        if (!restored) {
          void restore.settled
            .then((late) => {
              if (late && !cancelled && !restoreRetired) {
                dispatchStartup({ type: "restored", userId: user.id, restored: true });
              }
            })
            .catch(() => undefined);
        }
      }

      if (!encryptionReady) {
        const lock = await bootstrap(user.id, API_BASE_URL);
        if (cancelled) return;
        // An authoritative lock ends the session; an unavailable API keeps the password for the next attempt.
        if (lock) {
          restoreRetired = true;
          await signOut(
            lock === "cannot-open"
              ? UNLOCK_FAILED_NOTICE
              : SIGN_IN_TO_UNLOCK_NOTICE,
          );
          return;
        }
        encryptionReady = true;
      }

      restoreRetired = true;
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

      // Silent on failure; the next launch retries the seed and the sealing.
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
      // What the server reports is still stored in an older form is re-sealed now; anything that fails waits for the next launch.
      void upgradeStoredEncryption(calendarApiService)
        .then(async (settingsSealed) => {
          if (settingsSealed && !cancelled) {
            await queryClient.invalidateQueries({
              queryKey: QUERY_KEYS.settings(),
            });
          }
        })
        .catch(() => undefined);
      dispatchStartup({ type: "finished" });
    };

    const stopRetry = retrySessionStartup(initializeSession, (error) => {
      log.warn("Session startup failed", {
        errorName: error instanceof Error ? error.name : typeof error,
      });
      dispatchStartup({ type: "phase", message: "Waiting to reconnect…" });
    });

    return () => {
      cancelled = true;
      stopRetry();
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
    signOut,
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
    <View
      style={{ flex: 1 }}
      testID={isPushNavigationReady ? "workspace-ready" : "workspace-preparing"}
    >
      <WorkspaceContent blocked={isPreparingWorkspace}>
        {children}
      </WorkspaceContent>
      <PushNotificationNavigation
        navigationReady={isPushNavigationReady}
        handler={pushTapHandler}
      />
      <WorkspaceLoadingScreen
        active={isPreparingWorkspace}
        message={startup.message}
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
