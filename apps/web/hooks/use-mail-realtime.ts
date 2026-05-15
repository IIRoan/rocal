"use client";

import { useCallback, useEffect, useRef } from "react";
import { createLogger } from "@workspace/logger";
import { getApiBaseUrl } from "@/lib/api-url";
import { mailDemoApiService } from "@/lib/mail/api-service";
import type { MailRealtimeEvent, MailSyncResponse } from "@/lib/mail/types";

const log = createLogger("mail-realtime");

export function useMailRealtime(input: {
  accountId: string | null;
  enabled: boolean;
  onSync: (result: MailSyncResponse) => void | Promise<void>;
  debounceMs?: number;
}) {
  const onSyncRef = useRef(input.onSync);
  const debounceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    onSyncRef.current = input.onSync;
  }, [input.onSync]);

  const runSync = useCallback(async () => {
    if (!input.accountId) return;
    const result = await mailDemoApiService.syncAccount(input.accountId);
    await onSyncRef.current(result);
  }, [input.accountId]);

  // Single effect: runs initial sync, then opens the SSE EventSource to receive
  // server-pushed mail.changed signals. Debounces rapid signals before calling sync.
  // The server polls JMAP every 30 s per connected client, so no client-side polling needed.
  useEffect(() => {
    if (!input.enabled || !input.accountId || typeof window === "undefined") {
      return undefined;
    }

    const debounceMs = input.debounceMs ?? 750;
    let closed = false;
    let eventSource: EventSource | null = null;

    const scheduleDebouncedSync = () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = window.setTimeout(() => {
        debounceTimerRef.current = null;
        void runSync().catch((error) => {
          log.warn("Realtime mail sync failed", error);
        });
      }, debounceMs);
    };

    const handleOpen = () => { log.info("Mail realtime connected"); };
    const handleChange = (event: Event) => {
      const payload = JSON.parse(
        (event as MessageEvent<string>).data,
      ) as MailRealtimeEvent;
      if (payload.accountId !== input.accountId) return;
      scheduleDebouncedSync();
    };

    const cleanup = () => {
      closed = true;
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (eventSource) {
        eventSource.removeEventListener("open", handleOpen);
        eventSource.removeEventListener("mail.changed", handleChange);
        eventSource.close();
      }
    };

    // Initial sync on mount / accountId change
    void runSync().catch((error) => {
      log.warn("Initial mail sync failed", error);
    });

    if (typeof EventSource !== "function") {
      return cleanup;
    }

    try {
      eventSource = new EventSource(`${getApiBaseUrl()}/api/realtime/mail`, {
        withCredentials: true,
      });
    } catch (error) {
      log.warn("Failed to open mail realtime EventSource", error);
      return cleanup;
    }

    eventSource.addEventListener("open", handleOpen);
    eventSource.addEventListener("mail.changed", handleChange);

    eventSource.onerror = () => {
      if (!closed) {
        log.warn("Mail realtime connection error; browser will reconnect");
      }
    };

    return cleanup;
  }, [input.accountId, input.debounceMs, input.enabled, runSync]);
}
