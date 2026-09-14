import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../providers/AuthProvider";
import { prefetchWorkspaceTabs } from "../lib/workspace-tab-prefetch";

/**
 * Mount inside `(tabs)` to warm calendar + mail caches and keep both tabs alive.
 */
export function WorkspaceTabPreloader() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const prefetchedRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || prefetchedRef.current) {
      return;
    }
    prefetchedRef.current = true;
    void prefetchWorkspaceTabs(queryClient);
  }, [isAuthenticated, queryClient]);

  return null;
}
