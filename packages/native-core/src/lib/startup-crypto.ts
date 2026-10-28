import type { QueryClient } from "@tanstack/react-query";

export const STARTUP_CRYPTO_INITIAL_PHASE = "Setting up encryption…";

export interface AuthenticatedSessionInput {
  queryClient: QueryClient;
  userId: string;
  email?: string | null;
  displayName?: string | null;
  onPhaseChange?: (phase: string) => void;
  isCancelled: () => boolean;
}
