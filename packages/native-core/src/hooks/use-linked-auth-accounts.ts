import { useQuery } from "@tanstack/react-query";
import { linkedAuthAccountsQueryOptions } from "@workspace/calendar-client/account-query-options";
import { authClient } from "../lib/auth-client";
import { useAuth } from "../providers/AuthProvider";

export function useLinkedAuthAccounts() {
  const { user } = useAuth();
  return useQuery(
    linkedAuthAccountsQueryOptions(authClient, user?.id ?? null),
  );
}
