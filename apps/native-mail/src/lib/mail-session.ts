import type { AuthLifecycle } from "@workspace/native-core/providers/AuthProvider";
import {
  enforceFullEventEncryption,
  type AuthenticatedSessionInput,
} from "@workspace/native-core/lib/startup-crypto";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import { bootstrapMailboxForAccount } from "./mail/account-bootstrap";
import { clearVaultCache, ensureVaultLoaded } from "./mail/mail-crypto";
import { getMailAccountStatus, getMailConfig } from "./mail/mail-api";
import {
  clearCachedPrivateKey,
  clearDerivedVaultKey,
  clearMailVaultPassword,
  saveMailVaultPassword,
} from "./mail/mail-password-cache";
import { buildMailRuntime } from "./mail/mail-runtime";

/** Mail startup: provision the mailbox on first sign-in, then connect and unlock the vault. */
export async function prepareMailSession(
  input: AuthenticatedSessionInput,
): Promise<void> {
  const setPhase = (phase: string) => input.onPhaseChange?.(phase);

  await enforceFullEventEncryption(input);
  if (input.isCancelled()) return;

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

  if (!mailAccount.provisioned || input.isCancelled()) {
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

/** Keeps the vault password for this device's unlock and wipes every vault secret on sign-out. */
export const MAIL_AUTH_LIFECYCLE: AuthLifecycle = {
  onPasswordAuthenticated: (password) => saveMailVaultPassword(password),
  async onSignedOut() {
    await clearMailVaultPassword();
    await clearDerivedVaultKey();
    await clearCachedPrivateKey();
    clearVaultCache();
  },
};
