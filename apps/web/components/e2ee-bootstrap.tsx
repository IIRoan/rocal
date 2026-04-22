"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createLogger } from "@workspace/logger";
import { useSession } from "@/lib/auth-client";
import { ensureE2eeBootstrap, resetE2eeBootstrap } from "@/lib/e2ee-bootstrap";

const log = createLogger("e2ee-bootstrap");

function clearCalendarQueries(
  queryClient: ReturnType<typeof useQueryClient>,
): void {
  queryClient.removeQueries({ queryKey: ["events"] });
  queryClient.removeQueries({ queryKey: ["calendars"] });
  queryClient.removeQueries({ queryKey: ["categories"] });
  queryClient.removeQueries({ queryKey: ["settings"] });
}

export function E2eeBootstrap() {
  const queryClient = useQueryClient();
  const { data: session, isPending } = useSession();
  const userId = session?.user?.id;
  const previousUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isPending) {
      return;
    }

    const previousUserId = previousUserIdRef.current;

    if (!userId) {
      resetE2eeBootstrap();

      if (previousUserId) {
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

    let isCancelled = false;

    void ensureE2eeBootstrap(userId)
      .then((activated) => {
        if (isCancelled || !activated) {
          return;
        }

        return queryClient.invalidateQueries({ queryKey: ["events"] });
      })
      .catch((error) => {
        if (isCancelled) {
          return;
        }

        log.warn("Failed to initialize E2EE bootstrap", { userId, error });
      });

    return () => {
      isCancelled = true;
    };
  }, [isPending, queryClient, userId]);

  return null;
}