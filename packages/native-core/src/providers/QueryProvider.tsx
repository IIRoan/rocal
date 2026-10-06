import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/** Shared QueryClient: 60 s staleTime avoids refetch churn, 10 min gcTime keeps data for offline, retry 1 because HttpClient already retries. */
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
