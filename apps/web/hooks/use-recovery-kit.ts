"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRecoveryKit } from "@workspace/calendar-client";
import { recoveryKitQueryOptions } from "@workspace/calendar-client/account-query-options";
import { recoveryKitQueryKey } from "@workspace/calendar-core";
import { accountApiService } from "@/lib/api-clients";
import { useSession } from "@/lib/auth-client";
import { e2eeModule } from "@/lib/e2ee-crypto";
import { getEncryptionSession } from "@/lib/e2ee-payloads";

export function useRecoveryKit() {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;
  const email = session?.user?.email ?? "";
  const queryClient = useQueryClient();
  const queryKey = recoveryKitQueryKey(userId);
  const status = useQuery(recoveryKitQueryOptions(accountApiService, userId));
  const remove = useMutation({
    mutationFn: () => accountApiService.deleteRecoveryKit(),
    onSuccess: () => queryClient.setQueryData(queryKey, { exists: false }),
  });

  /** Returns the new key for the caller to show once; no mutation is used, so the key never enters a TanStack cache. */
  const create = async (currentPassword: string): Promise<string> => {
    const keys = await getEncryptionSession();
    if (!keys || keys.userId !== userId) {
      throw new Error(
        "Your encrypted data is not open in this browser. Sign in again, then create a recovery kit.",
      );
    }
    return createRecoveryKit({
      api: {
        putRecoveryKit: async (request) => {
          const stored = await accountApiService.putRecoveryKit(request);
          queryClient.setQueryData(queryKey, stored);
          return stored;
        },
      },
      e2ee: e2eeModule,
      keys,
      email,
      currentPassword,
    });
  };

  return { status, create, remove };
}
