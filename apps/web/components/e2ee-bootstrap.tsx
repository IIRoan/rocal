"use client";

import { useEffect, useReducer, useRef, type MutableRefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createLogger } from "@workspace/logger";
import { useSession } from "@/lib/auth-client";
import {
  ensureE2eeBootstrap,
  resetE2eeBootstrap,
  unlockE2eeWithPassword,
} from "@/lib/e2ee-bootstrap";
import { resetEncryptionPasswordForActiveSession } from "@/lib/e2ee-password-reset";
import {
  clearAuthPasswords,
  clearPendingAuthPassword,
  consumePendingAuthPassword,
  peekCachedAuthPassword,
  peekPendingAuthPassword,
} from "@/lib/e2ee-password-cache";
import {
  clearEncPasswordCookie,
  initEncPasswordFromCookie,
  setEncPasswordCookie,
} from "@/lib/enc-password-cookie";
import { signOutAndClearLocalState } from "@/lib/auth-local-state";
import { E2eeBootstrapDialog } from "./e2ee-bootstrap-dialog";
import {
  e2eeGateReducer,
  initialE2eeGateState,
  type GateMode,
} from "./e2ee-bootstrap-gate-state";

const log = createLogger("e2ee-bootstrap");
const PASSWORD_SETUP_RETRY_ATTEMPTS = 4;

type BootstrapGateState = {
  mode: GateMode;
  isSubmitting: boolean;
};

function clearCalendarQueries(
  queryClient: ReturnType<typeof useQueryClient>,
): void {
  queryClient.removeQueries({ queryKey: ["events"] });
  queryClient.removeQueries({ queryKey: ["calendars"] });
  queryClient.removeQueries({ queryKey: ["categories"] });
  queryClient.removeQueries({ queryKey: ["settings"] });
}

async function refreshEncryptedQueries(
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["events"] }),
    queryClient.invalidateQueries({ queryKey: ["calendars"] }),
    queryClient.invalidateQueries({ queryKey: ["categories"] }),
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

async function resolveBootstrapGateState(input: {
  userId: string;
  result: Awaited<ReturnType<typeof ensureE2eeBootstrap>>;
  isCancelled: () => boolean;
}): Promise<BootstrapGateState | null> {
  const { userId, result, isCancelled } = input;

  if (isCancelled()) {
    return null;
  }

  if (!result.bootstrap) {
    return { mode: "hidden", isSubmitting: false };
  }

  if (result.activated && !result.bootstrap.passwordEnvelope) {
    const pendingPassword =
      consumePendingAuthPassword() ?? peekCachedAuthPassword();

    if (pendingPassword) {
      const stored = await attemptEncryptionPasswordSetup(
        userId,
        pendingPassword,
      );

      if (isCancelled()) {
        return null;
      }

      if (stored) {
        return { mode: "hidden", isSubmitting: false };
      }
    }

    return { mode: "setup", isSubmitting: false };
  }

  if (result.activated) {
    return { mode: "hidden", isSubmitting: false };
  }

  if (result.bootstrap.passwordEnvelope) {
    return { mode: "unlock", isSubmitting: false };
  }

  if (result.bootstrap.devices.length > 0) {
    return { mode: "legacy", isSubmitting: false };
  }

  return { mode: "hidden", isSubmitting: false };
}

async function runEncryptionPasswordSetup(input: {
  userId: string;
  password: string;
  confirmPassword: string;
  queryClient: ReturnType<typeof useQueryClient>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { userId, password, confirmPassword, queryClient } = input;

  if (password.length < 8) {
    return {
      ok: false,
      error: "Use at least 8 characters for your encryption password.",
    };
  }

  if (password !== confirmPassword) {
    return { ok: false, error: "Passwords do not match." };
  }

  const stored = await resetEncryptionPasswordForActiveSession(userId, password);

  if (!stored) {
    return {
      ok: false,
      error: "Encryption session is not ready on this device.",
    };
  }

  void setEncPasswordCookie(password);
  await refreshEncryptedQueries(queryClient);
  return { ok: true };
}

async function runEncryptionPasswordUnlock(input: {
  userId: string;
  password: string;
  isEmailPasswordUser: boolean;
  queryClient: ReturnType<typeof useQueryClient>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { userId, password, isEmailPasswordUser, queryClient } = input;

  if (!password) {
    return {
      ok: false,
      error: isEmailPasswordUser
        ? "Enter your email sign-in password."
        : "Enter your encryption password.",
    };
  }

  const unlocked = await unlockE2eeWithPassword(userId, password);

  if (!unlocked) {
    return {
      ok: false,
      error: isEmailPasswordUser
        ? "That password didn't match. If you recently changed your email sign-in password, use your previous one here."
        : "That password did not unlock your encrypted data.",
    };
  }

  void setEncPasswordCookie(password);
  await refreshEncryptedQueries(queryClient);
  return { ok: true };
}

async function runEncryptionGateSignOut(
  userId: string | undefined,
): Promise<void> {
  try {
    await signOutAndClearLocalState();
  } catch (signOutError) {
    log.warn("Failed to sign out from encryption gate", {
      userId,
      error: signOutError,
    });
  }

  window.location.href = "/";
}

async function runBootstrapCycle(input: {
  userId: string;
  queryClient: ReturnType<typeof useQueryClient>;
  runId: number;
  bootstrapRunIdRef: MutableRefObject<number>;
  isCancelled: () => boolean;
  onEmailPasswordUser: (value: boolean) => void;
  onGateResolved: (gate: BootstrapGateState) => void;
}): Promise<void> {
  const {
    userId,
    queryClient,
    runId,
    bootstrapRunIdRef,
    isCancelled,
    onEmailPasswordUser,
    onGateResolved,
  } = input;

  await initEncPasswordFromCookie();
  if (isCancelled() || runId !== bootstrapRunIdRef.current) {
    return;
  }

  const hadPendingPassword =
    !!peekPendingAuthPassword() || !!peekCachedAuthPassword();
  onEmailPasswordUser(hadPendingPassword);

  try {
    const result = await ensureE2eeBootstrap(userId);
    if (isCancelled() || runId !== bootstrapRunIdRef.current) {
      return;
    }

    if (result.activated) {
      await refreshEncryptedQueries(queryClient);
    }

    const nextGate = await resolveBootstrapGateState({
      userId,
      result,
      isCancelled: () => isCancelled() || runId !== bootstrapRunIdRef.current,
    });

    if (!nextGate) {
      return;
    }

    onGateResolved(nextGate);
  } catch (bootstrapError) {
    if (isCancelled() || runId !== bootstrapRunIdRef.current) {
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
  const previousUserIdRef = useRef<string | null>(null);
  const bootstrapRunIdRef = useRef(0);
  const [gate, dispatchGate] = useReducer(e2eeGateReducer, initialE2eeGateState);

  useEffect(() => {
    if (isPending) {
      return;
    }

    const previousUserId = previousUserIdRef.current;

    if (!userId) {
      resetE2eeBootstrap();
      queueMicrotask(() => {
        dispatchGate({ type: "reset" });
      });

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

    queueMicrotask(() => {
      if (!isCancelled && runId === bootstrapRunIdRef.current) {
        dispatchGate({ type: "clear-error" });
      }
    });

    void runBootstrapCycle({
      userId,
      queryClient,
      runId,
      bootstrapRunIdRef,
      isCancelled: () => isCancelled,
      onEmailPasswordUser: (value) => {
        dispatchGate({ type: "set-email-password-user", value });
      },
      onGateResolved: (nextGate) => {
        dispatchGate({
          type: "set-from-bootstrap",
          mode: nextGate.mode,
          isSubmitting: nextGate.isSubmitting,
        });
      },
    });

    return () => {
      isCancelled = true;
    };
  }, [isPending, queryClient, userId]);

  const rerunBootstrap = () => {
    if (!userId || isPending) {
      return;
    }

    const runId = ++bootstrapRunIdRef.current;
    dispatchGate({ type: "clear-error" });

    void runBootstrapCycle({
      userId,
      queryClient,
      runId,
      bootstrapRunIdRef,
      isCancelled: () => runId !== bootstrapRunIdRef.current,
      onEmailPasswordUser: (value) => {
        dispatchGate({ type: "set-email-password-user", value });
      },
      onGateResolved: (nextGate) => {
        dispatchGate({
          type: "set-from-bootstrap",
          mode: nextGate.mode,
          isSubmitting: nextGate.isSubmitting,
        });
      },
    });
  };

  async function handleSetup() {
    if (!userId) {
      return;
    }

    dispatchGate({ type: "start-submit" });

    const outcome = await runEncryptionPasswordSetup({
      userId,
      password: gate.password,
      confirmPassword: gate.confirmPassword,
      queryClient,
    });

    dispatchGate({ type: "end-submit" });

    if (outcome.ok === false) {
      if (outcome.error === "Encryption session is not ready on this device.") {
        log.warn("Failed to refresh encrypted data for password setup", {
          userId,
        });
        dispatchGate({
          type: "set-error",
          error:
            "Could not save your encryption password and refresh encrypted data.",
        });
        return;
      }

      dispatchGate({ type: "set-error", error: outcome.error });
      return;
    }

    dispatchGate({ type: "success-hide" });
  }

  async function handleUnlock() {
    if (!userId) {
      return;
    }

    dispatchGate({ type: "start-submit" });

    const outcome = await runEncryptionPasswordUnlock({
      userId,
      password: gate.password,
      isEmailPasswordUser: gate.isEmailPasswordUser,
      queryClient,
    });

    dispatchGate({ type: "end-submit" });

    if (outcome.ok === false) {
      if (
        outcome.error.includes("did not unlock") ||
        outcome.error.includes("didn't match")
      ) {
        log.warn("Failed to unlock E2EE password envelope", {
          userId,
        });
      }
      dispatchGate({ type: "set-error", error: outcome.error });
      return;
    }

    dispatchGate({ type: "success-hide" });
  }

  async function handleSignOut() {
    dispatchGate({ type: "start-submit" });
    await runEncryptionGateSignOut(userId);
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (gate.isSubmitting || gate.mode === "legacy") {
      return;
    }
    if (gate.mode === "unlock") {
      void handleUnlock();
    } else {
      void handleSetup();
    }
  };

  if (gate.mode === "hidden") {
    return null;
  }

  return (
    <E2eeBootstrapDialog
      gate={gate}
      onPasswordChange={(password) =>
        dispatchGate({ type: "set-password", password })
      }
      onConfirmPasswordChange={(confirmPassword) =>
        dispatchGate({ type: "set-confirm-password", confirmPassword })
      }
      onSubmit={handleSubmit}
      onSignOut={() => {
        void handleSignOut();
      }}
      onRetryBootstrap={rerunBootstrap}
    />
  );
}
