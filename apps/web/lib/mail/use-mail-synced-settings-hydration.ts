"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import { mailQueryKeys } from "./mail-query-keys";

/** Pulls the encrypted server copy into local prefs once per session; the settings hooks re-read on their change events. */
export function useMailSyncedSettingsHydration(): void {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;
  useQuery({
    queryKey: mailQueryKeys.syncedSettings(userId),
    queryFn: async () => {
      const { loadMailSyncedSettings } = await import("@/lib/e2ee-mail-settings");
      return loadMailSyncedSettings();
    },
    enabled: Boolean(userId),
    staleTime: (query) => (query.state.data ? 5 * 60_000 : 0),
    retry: false,
  });
}
