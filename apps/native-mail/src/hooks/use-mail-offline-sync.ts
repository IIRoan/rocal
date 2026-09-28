import { useEffect } from "react";
import { AppState } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/native-core/providers/AuthProvider";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import type { MailRuntime } from "../lib/mail/mail-runtime";
import { getMailSyncState, syncMailboxChanges } from "../lib/mail/mail-sync";
import {
  captureMailOfflineSnapshot,
  isMailOfflineSnapshotKey,
} from "../lib/mail/mail-offline-snapshot";
import { saveMailOfflineSnapshot } from "../lib/mail/mail-offline-store";

const SYNC_INTERVAL_MS = 30_000;
const SNAPSHOT_WRITE_DELAY_MS = 1_500;

/** Runs `task` once after `delayMs`, coalescing repeat schedules; `flush` runs a pending task now. */
function createDelayedTask(task: () => void, delayMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const run = () => {
    timer = undefined;
    task();
  };
  return {
    schedule: () => {
      timer ??= setTimeout(run, delayMs);
    },
    flush: () => {
      if (timer === undefined) return;
      cancel();
      task();
    },
    cancel,
  };
}

/** Keeps the mailbox reconciled in the background (launch, foreground, every 30 s) and mirrors it into the encrypted on-device snapshot. */
export function useMailOfflineSync(runtime: MailRuntime | undefined) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!runtime) return;
    const sync = () => {
      void syncMailboxChanges(queryClient, runtime).catch(() => undefined);
    };
    const interval = setInterval(() => {
      if (AppState.currentState === "active") sync();
    }, SYNC_INTERVAL_MS);

    if (AppState.currentState === "active") sync();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      sync();
      void queryClient.refetchQueries({
        queryKey: QUERY_KEYS.mailRuntime(),
        stale: true,
      });
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [queryClient, runtime]);

  useEffect(() => {
    if (!userId) return;
    const writer = createDelayedTask(() => {
      const snapshot = captureMailOfflineSnapshot(queryClient, {
        userId,
        emailState: getMailSyncState(),
      });
      if (snapshot) {
        void saveMailOfflineSnapshot(snapshot).catch(() => undefined);
      }
    }, SNAPSHOT_WRITE_DELAY_MS);

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated") return;
      if (event.action.type !== "success" && event.action.type !== "invalidate") {
        return;
      }
      if (!isMailOfflineSnapshotKey(event.query.queryKey)) return;
      writer.schedule();
    });
    // Flush right away when leaving the foreground; iOS may suspend the JS thread before the timer fires.
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") writer.flush();
    });
    return () => {
      unsubscribe();
      subscription.remove();
      writer.cancel();
    };
  }, [queryClient, userId]);
}
