"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AuthSessionGuard } from "@/components/auth-session-guard";
import { E2eeBootstrap } from "@/components/e2ee-bootstrap";
import { mailQueryKeys } from "@/lib/mail/mail-query-keys";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 5 * 60 * 1000, // 5 minutes
          refetchOnWindowFocus: false,
        },
      },
    });
    // Mailbox pages and threads are written by hand with no observer, so they would expire five minutes after their first write; sign-out clears them.
    client.setQueryDefaults(mailQueryKeys.messages(), { gcTime: Infinity });
    client.setQueryDefaults(mailQueryKeys.threads(), { gcTime: Infinity });
    return client;
  });

  return (
    <QueryClientProvider client={queryClient}>
      <AuthSessionGuard>
        <E2eeBootstrap />
        {children}
      </AuthSessionGuard>
    </QueryClientProvider>
  );
}
