import type { QueryClient } from "@tanstack/react-query";
import { createLogger } from "@workspace/logger";
import { calendarApiService } from "./api";
import { QUERY_KEYS } from "./query-keys";

const log = createLogger("native:startup-crypto");

export const STARTUP_CRYPTO_INITIAL_PHASE = "Setting up encryption…";

export interface AuthenticatedSessionInput {
  queryClient: QueryClient;
  userId: string;
  email?: string | null;
  displayName?: string | null;
  onPhaseChange?: (phase: string) => void;
  isCancelled: () => boolean;
}

/** Both apps write event data (mail imports invitations), so both enforce full event encryption. */
export async function enforceFullEventEncryption(
  input: Pick<AuthenticatedSessionInput, "queryClient" | "userId" | "onPhaseChange">,
): Promise<void> {
  input.onPhaseChange?.("Enabling full event encryption…");
  try {
    const settings = await input.queryClient.fetchQuery({
      queryKey: QUERY_KEYS.settings(),
      queryFn: () => calendarApiService.getUserSettings(),
      staleTime: 5 * 60_000,
    });

    if (settings.eventEncryptionMode !== "full") {
      const updated = await calendarApiService.updateUserSettings({
        eventEncryptionMode: "full",
      });
      input.queryClient.setQueryData(QUERY_KEYS.settings(), updated);
    }
  } catch (error) {
    log.warn("Could not enforce full event encryption during startup", {
      userId: input.userId,
      error,
    });
  }
}
