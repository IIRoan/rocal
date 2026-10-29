"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  CALENDARS_QUERY_KEY,
  CATEGORIES_QUERY_KEY,
  EVENTS_QUERY_KEY,
  SETTINGS_QUERY_KEY,
} from "@workspace/calendar-core";
import { createLogger } from "@workspace/logger";
import { calendarApiService } from "@/lib/calendar-api-service";
import { useSession } from "@/lib/auth-client";
import {
  ensureE2eeBootstrap,
  resetE2eeBootstrap,
  unlockE2eeWithPassword,
} from "@/lib/e2ee-bootstrap";
import { resetEncryptionPasswordForActiveSession } from "@/lib/e2ee-password-reset";
import {
  clearAuthPasswords,
  peekAuthPassword,
} from "@/lib/e2ee-password-cache";
import {
  clearEncPasswordCookie,
  initEncPasswordFromCookie,
} from "@/lib/enc-password-cookie";
import { signOutAndClearLocalState } from "@/lib/auth-local-state";
import {
  beginAuthNavigation,
  buildE2eeLockLoginHref,
  isPasskeyBridgePath,
  type E2eeLockReason,
} from "@/lib/auth-navigation";

const log = createLogger("e2ee-bootstrap");
const PASSWORD_SETUP_RETRY_ATTEMPTS = 4;

function clearCalendarQueries(
  queryClient: ReturnType<typeof useQueryClient>,
): void {
  queryClient.removeQueries({ queryKey: EVENTS_QUERY_KEY });
  queryClient.removeQueries({ queryKey: CALENDARS_QUERY_KEY });
  queryClient.removeQueries({ queryKey: CATEGORIES_QUERY_KEY });
  queryClient.removeQueries({ queryKey: SETTINGS_QUERY_KEY });
}

async function ensureDefaultCalendars(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  if (await calendarApiService.ensureDefaultCalendars()) {
    await queryClient.invalidateQueries({ queryKey: CALENDARS_QUERY_KEY });
  }
}

async function ensureSealedSettings(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  if (await calendarApiService.ensureSealedUserSettings()) {
    await queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
  }
}

async function refreshEncryptedQueries(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  // Failures are swallowed on purpose: seeding and sealing retry on the next bootstrap.
  void ensureDefaultCalendars(queryClient).catch(() => undefined);
  void ensureSealedSettings(queryClient).catch(() => undefined);

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: EVENTS_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: CALENDARS_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY }),
  ]);
}

async function attemptEncryptionPasswordSetup(
  userId: string,
  password: string,
  attempt = 0,
): Promise<boolean> {
  if (attempt >= PASSWORD_SETUP_RETRY_ATTEMPTS) {
    return false;
  }

  const stored = await resetEncryptionPasswordForActiveSession(
    userId,
    password,
  );

  if (stored) {
    return true;
  }

  if (attempt + 1 < PASSWORD_SETUP_RETRY_ATTEMPTS) {
    await Promise.resolve();
  }

  return attemptEncryptionPasswordSetup(userId, password, attempt + 1);
}

/** Resolves the lock that ends this session, null when it may stay; network failures never lock. */
async function resolveBootstrapLock(input: {
  userId: string;
  result: Awaited<ReturnType<typeof ensureE2eeBootstrap>>;
  queryClient: ReturnType<typeof useQueryClient>;
  isCancelled: () => boolean;
}): Promise<E2eeLockReason | null> {
  const { userId, result, queryClient, isCancelled } = input;
  const bootstrap = result.bootstrap;

  if (isCancelled() || !bootstrap) {
    return null;
  }

  if (result.activated) {
    const pendingPassword = peekAuthPassword();
    // This browser holds the only keys, so it stays signed in; the envelope is stored once the sign-in password is at hand.
    if (!bootstrap.passwordEnvelope && pendingPassword) {
      await attemptEncryptionPasswordSetup(userId, pendingPassword);
    }
    return null;
  }

  if (!bootstrap.passwordEnvelope) {
    return bootstrap.devices.length > 0 ? "failed" : null;
  }

  if (result.passwordUnlockFailed) {
    return "failed";
  }

  const pendingPassword = peekAuthPassword();
  if (!pendingPassword) {
    return "sign-in";
  }

  const unlocked = await unlockE2eeWithPassword(userId, pendingPassword);
  if (isCancelled()) {
    return null;
  }
  if (unlocked.activated) {
    await refreshEncryptedQueries(queryClient);
    return null;
  }
  return unlocked.passwordUnlockFailed ? "failed" : null;
}

/** Signed in means unlocked: a session that cannot open the account key ends, and the login page says why. */
function endLockedSession(reason: E2eeLockReason): void {
  const finishNavigation = beginAuthNavigation(buildE2eeLockLoginHref(reason));
  if (!finishNavigation) return;
  void signOutAndClearLocalState()
    .then(finishNavigation)
    .catch(finishNavigation);
}

async function runBootstrapCycle(input: {
  userId: string;
  queryClient: ReturnType<typeof useQueryClient>;
  runId: number;
  bootstrapRunIdRef: MutableRefObject<number>;
  isCancelled: () => boolean;
}): Promise<void> {
  const { userId, queryClient, runId, bootstrapRunIdRef, isCancelled } = input;
  const isStale = () => isCancelled() || runId !== bootstrapRunIdRef.current;

  await initEncPasswordFromCookie();
  if (isStale()) {
    return;
  }

  try {
    const result = await ensureE2eeBootstrap(userId);
    if (isStale()) {
      return;
    }

    if (result.activated) {
      await refreshEncryptedQueries(queryClient);
    }

    const lock = await resolveBootstrapLock({
      userId,
      result,
      queryClient,
      isCancelled: isStale,
    });

    if (lock && !isStale()) {
      endLockedSession(lock);
    }
  } catch (bootstrapError) {
    if (isStale()) {
      return;
    }

    log.warn("Failed to initialize E2EE bootstrap", {
      userId,
      error: bootstrapError,
    });
  }
}

export function E2eeBootstrap() {
  const queryClient = useQueryClient();
  const { data: session, isPending } = useSession();
  const userId = session?.user?.id;
  // The native passkey bridge holds a short-lived browser session for the app, which must not be unlocked or ended here.
  const isPasskeyBridge = isPasskeyBridgePath(usePathname());
  const previousUserIdRef = useRef<string | null>(null);
  const bootstrapRunIdRef = useRef(0);

  useEffect(() => {
    if (isPending || isPasskeyBridge) {
      return;
    }

    const previousUserId = previousUserIdRef.current;

    if (!userId) {
      resetE2eeBootstrap();

      if (previousUserId) {
        clearAuthPasswords();
        clearEncPasswordCookie();
        clearCalendarQueries(queryClient);
      }

      previousUserIdRef.current = null;
      return;
    }

    if (previousUserId && previousUserId !== userId) {
      resetE2eeBootstrap();
      clearCalendarQueries(queryClient);
    }

    previousUserIdRef.current = userId;

    const runId = ++bootstrapRunIdRef.current;
    let isCancelled = false;

    void runBootstrapCycle({
      userId,
      queryClient,
      runId,
      bootstrapRunIdRef,
      isCancelled: () => isCancelled,
    });

    return () => {
      isCancelled = true;
    };
  }, [isPasskeyBridge, isPending, queryClient, userId]);

  return null;
}
