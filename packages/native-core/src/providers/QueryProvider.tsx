import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Shared QueryClient instance.
 *
 * - `staleTime` of 60 s avoids redundant refetches on tab switches.
 * - `gcTime` (formerly `cacheTime`) of 10 min keeps data around for
 *   offline access.
 * - `retry` is set to 1 because the HttpClient already retries
 *   transient errors internally.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false, // Not meaningful on mobile.
    },
    mutations: {
      retry: 0,
    },
  },
});

export function QueryProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

/** Exposed for cache invalidation from outside React (e.g. push handlers). */
export { queryClient };
