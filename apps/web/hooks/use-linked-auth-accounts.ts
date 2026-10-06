"use client";

import { useQuery } from "@tanstack/react-query";
import { linkedAuthAccountsQueryOptions } from "@workspace/calendar-client/account-query-options";
import { authClient, useSession } from "@/lib/auth-client";

export function useLinkedAuthAccounts() {
  const { data: session } = useSession();
  return useQuery(
    linkedAuthAccountsQueryOptions(authClient, session?.user?.id ?? null),
  );
}
