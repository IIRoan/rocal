import type { QueryClient } from "@tanstack/react-query";
import { createLogger } from "@workspace/logger";
import { calendarApiService } from "./api";
import { QUERY_KEYS } from "./query-keys";
import { bootstrapMailboxForAccount } from "./mail/account-bootstrap";
import { ensureVaultLoaded } from "./mail/mail-crypto";
import { getMailAccountStatus, getMailConfig } from "./mail/mail-api";
import { buildMailRuntime } from "./mail/mail-runtime";

const log = createLogger("native:startup-crypto");

export type StartupCryptoPhase =
  | "Setting up encryption…"
  | "Enabling full event encryption…"
  | "Checking encrypted mail…"
  | "Generating mailbox keys…"
  | "Connecting encrypted mail…"
  | "Unlocking encrypted mail…";

export async function prepareAuthenticatedCryptoSession(input: {
  queryClient: QueryClient;
  userId: string;
  email?: string | null;
  displayName?: string | null;
  onPhaseChange?: (phase: StartupCryptoPhase) => void;
}): Promise<void> {
  const setPhase = (phase: StartupCryptoPhase) => input.onPhaseChange?.(phase);

  setPhase("Enabling full event encryption…");
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

  setPhase("Checking encrypted mail…");

  const [mailConfig, initialMailAccount] = await Promise.all([
    input.queryClient.fetchQuery({
      queryKey: QUERY_KEYS.mailConfig(),
      queryFn: getMailConfig,
      staleTime: 5 * 60_000,
    }),
    input.queryClient.fetchQuery({
      queryKey: QUERY_KEYS.mailAccount(),
      queryFn: getMailAccountStatus,
      staleTime: 60_000,
    }),
  ]);

  let mailAccount = initialMailAccount;

  if (!mailAccount.provisioned && mailConfig.signupEnabled) {
    const email = input.email?.trim();
    if (!email) {
      throw new Error("Mailbox bootstrap requires an authenticated email.");
    }

    setPhase("Generating mailbox keys…");
    const provisioned = await bootstrapMailboxForAccount({
      userId: input.userId,
      email,
      displayName: input.displayName ?? null,
    });

    mailAccount = {
      email: provisioned.email,
      displayName: provisioned.displayName,
      provisioned: true,
    };

    input.queryClient.setQueryData(QUERY_KEYS.mailAccount(), mailAccount);
  }

  if (!mailAccount.provisioned) {
    return;
  }

  setPhase("Connecting encrypted mail…");
  const runtime = await input.queryClient.fetchQuery({
    queryKey: QUERY_KEYS.mailRuntime(),
    queryFn: buildMailRuntime,
    staleTime: 5 * 60_000,
  });

  setPhase("Unlocking encrypted mail…");
  await ensureVaultLoaded(runtime);
}
