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
import { upgradeStoredEncryption } from "@workspace/calendar-client";
import { lockWithoutDeviceKeys } from "@workspace/e2ee";
import { calendarApiService } from "@/lib/calendar-api-service";
import { useSession } from "@/lib/auth-client";
import { ensureE2eeBootstrap, resetE2eeBootstrap } from "@/lib/e2ee-bootstrap";
import {
  clearAuthPasswords,
  clearLegacyRememberedPassword,
} from "@/lib/e2ee-password-cache";
import { endLockedSession } from "@/lib/auth-local-state";
import { isPasskeyBridgePath } from "@/lib/auth-navigation";
import { LOGIN_PATH } from "@/lib/app-routes";

const log = createLogger("e2ee-bootstrap");

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

async function upgradeEncryption(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  if (await upgradeStoredEncryption(calendarApiService)) {
    await queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
  }
}

async function refreshEncryptedQueries(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  // Failures are swallowed on purpose: seeding and re-sealing retry on the next bootstrap.
  void ensureDefaultCalendars(queryClient).catch(() => undefined);
  void upgradeEncryption(queryClient).catch(() => undefined);

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: EVENTS_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: CALENDARS_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY }),
  ]);
}

/** Away from the login page no sign-in password is held, so a device that cannot open its own key can only ask for one. */
function resolveBootstrapLock(
  result: Awaited<ReturnType<typeof ensureE2eeBootstrap>>,
) {
  const bootstrap = result.bootstrap;
  if (!bootstrap || result.activated) return null;
  return lockWithoutDeviceKeys({
    hasEnvelope: Boolean(bootstrap.passwordEnvelope),
    hasOtherDevices: bootstrap.devices.length > 0,
    password: "none",
    opened: false,
  });
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

  clearLegacyRememberedPassword();

  try {
    const result = await ensureE2eeBootstrap(userId);
    if (isStale()) {
      return;
    }

    if (result.activated) {
      await refreshEncryptedQueries(queryClient);
    }

    const lock = resolveBootstrapLock(result);
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
  const pathname = usePathname();
  // The native passkey bridge holds a short-lived browser session for the app, which must not be unlocked or ended here.
  const isPasskeyBridge = isPasskeyBridgePath(pathname);
  // The login page opens the keys with the sign-in password itself before it navigates away.
  const isLoginPage = pathname === LOGIN_PATH;
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
    if (isLoginPage) {
      return;
    }

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
  }, [isLoginPage, isPasskeyBridge, isPending, queryClient, userId]);

  return null;
}
