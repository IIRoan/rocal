import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRecoveryKit } from "@workspace/calendar-client";
import { recoveryKitQueryOptions } from "@workspace/calendar-client/account-query-options";
import { recoveryKitQueryKey } from "@workspace/calendar-core";
import { accountApiService } from "../lib/api";
import { useAuth } from "../providers/AuthProvider";
import { useE2ee } from "../providers/E2eeProvider";

/** The recovery kit status, and creating or removing a kit; a new key lives only in the create mutation until it is reset. */
export function useRecoveryKit() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { runWithAccountKey } = useE2ee();
  const userId = user?.id ?? null;
  const statusQuery = useQuery(recoveryKitQueryOptions(accountApiService, userId));
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: recoveryKitQueryKey(userId) });

  const createMutation = useMutation({
    // The key is shown once; it must not outlive the page in the mutation cache.
    gcTime: 0,
    mutationFn: async (currentPassword: string) => {
      const key = await runWithAccountKey((accountKey, e2ee, blindIndexKey) =>
        createRecoveryKit({
          api: accountApiService,
          e2ee,
          keys: { accountKey, blindIndexKey },
          email: user?.email ?? "",
          currentPassword,
        }),
      );
      if (!key) {
        throw new Error("Your encrypted data is not unlocked on this device.");
      }
      return key;
    },
    onSettled: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: () => accountApiService.deleteRecoveryKit(),
    onSettled: invalidate,
  });

  return { statusQuery, createMutation, deleteMutation };
}
