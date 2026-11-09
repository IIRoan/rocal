import type { QueryClient } from "@tanstack/react-query";
import { AppState } from "react-native";

export const STARTUP_CRYPTO_INITIAL_PHASE = "Setting up encryption…";

export interface AuthenticatedSessionInput {
  queryClient: QueryClient;
  userId: string;
  email?: string | null;
  displayName?: string | null;
  onPhaseChange?: (phase: string) => void;
  isCancelled: () => boolean;
}

/** Retry transient startup failures while active without overlapping attempts or surviving account changes. */
export function retrySessionStartup(
  initialize: () => Promise<void>,
  onFailure: (error: unknown) => void,
): () => void {
  let cancelled = false;
  let running = false;
  let completed = false;
  let retryDelay = 1000;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const start = () => {
    if (cancelled || running || completed) return;
    running = true;
    void initialize()
      .then(() => { completed = true; })
      .catch((error: unknown) => {
        if (cancelled) return;
        onFailure(error);
        retryTimer = setTimeout(() => {
          retryTimer = undefined;
          if (AppState.currentState === "active") start();
        }, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30_000);
      })
      .finally(() => { running = false; });
  };

  const subscription = AppState.addEventListener("change", (state) => {
    clearTimeout(retryTimer);
    retryTimer = undefined;
    if (state === "active") start();
  });
  start();
  return () => {
    cancelled = true;
    clearTimeout(retryTimer);
    subscription.remove();
  };
}
