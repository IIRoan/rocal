import type { QueryClient } from "@tanstack/react-query";
import type { AuthLifecycle } from "@workspace/native-core/providers/AuthProvider";
import {
  enforceFullEventEncryption,
  type AuthenticatedSessionInput,
} from "@workspace/native-core/lib/startup-crypto";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import { bootstrapMailboxForAccount } from "./mail/account-bootstrap";
import {
  clearVaultCache,
  ensureVaultLoaded,
  holdVaultUnlock,
  releaseVaultUnlock,
} from "./mail/mail-crypto";
import { getMailAccountStatus, getMailConfig } from "./mail/mail-api";
import {
  clearCachedPrivateKey,
  clearDerivedVaultKey,
  clearMailVaultPassword,
  saveMailVaultPassword,
} from "./mail/mail-password-cache";
import { buildMailRuntime, type MailRuntime } from "./mail/mail-runtime";
import { clearSenderKeyCache } from "./mail/mail-sender-key";
import { clearMailSettings } from "./mail/mail-settings-store";
import { clearMailListSettings } from "./mail/mail-list-settings-store";
import {
  clearMailOfflineSnapshot,
  loadMailOfflineSnapshot,
} from "./mail/mail-offline-store";
import { hydrateMailOfflineSnapshot } from "./mail/mail-offline-snapshot";
import {
  getMailSyncState,
  resetMailSync,
  setMailSyncState,
} from "./mail/mail-sync";

const RUNTIME_STALE_MS = 5 * 60_000;

let restoredUserId: string | null = null;
let restoreGeneration = 0;

/** Seeds the cache from the encrypted snapshot before E2EE starts, so the mailbox opens without the loading screen. */
export async function restoreMailSession(input: {
  queryClient: QueryClient;
  userId: string;
  isCancelled: () => boolean;
}): Promise<boolean> {
  const generation = ++restoreGeneration;
  const snapshot = await loadMailOfflineSnapshot(input.userId);
  if (!snapshot || input.isCancelled() || generation !== restoreGeneration) {
    return false;
  }
  holdVaultUnlock();
  // A sync that already ran this launch is newer than the snapshot; never rewind it.
  if (getMailSyncState() === null) setMailSyncState(snapshot.emailState);
  hydrateMailOfflineSnapshot(input.queryClient, snapshot);
  restoredUserId = input.userId;
  return true;
}

/** Runs behind an already-visible mailbox: refresh the runtime and unlock the vault in parallel. */
async function finishRestoredMailSession(
  input: AuthenticatedSessionInput,
): Promise<void> {
  const { queryClient } = input;
  const restoredRuntime = queryClient.getQueryData<MailRuntime>(
    QUERY_KEYS.mailRuntime(),
  );
  await Promise.all([
    enforceFullEventEncryption(input),
    queryClient.fetchQuery({
      queryKey: QUERY_KEYS.mailRuntime(),
      queryFn: buildMailRuntime,
      staleTime: RUNTIME_STALE_MS,
    }),
    restoredRuntime
      ? ensureVaultLoaded(restoredRuntime).then(() =>
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.mailLabels() }),
        )
      : Promise.resolve(),
  ]);
}

/** Mail startup: provision the mailbox on first sign-in, then connect and unlock the vault. */
export async function prepareMailSession(
  input: AuthenticatedSessionInput,
): Promise<void> {
  const setPhase = (phase: string) => input.onPhaseChange?.(phase);

  // The guard only calls this once E2EE bootstrap settled, so waiting vault unlocks can proceed.
  releaseVaultUnlock();
  if (restoredUserId === input.userId) {
    await finishRestoredMailSession(input);
    return;
  }

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
    staleTime: RUNTIME_STALE_MS,
  });
  // Anchor sync before the first list loads so that list is never refetched just to set a baseline.
  setMailSyncState(
    await runtime.client.getEmailState(runtime.session).catch(() => null),
  );

  setPhase("Unlocking encrypted mail…");
  await ensureVaultLoaded(runtime);
}

/** Keeps the vault password for this device's unlock and wipes every vault secret on sign-out. */
export const MAIL_AUTH_LIFECYCLE: AuthLifecycle = {
  onPasswordAuthenticated: (password) => saveMailVaultPassword(password),
  async onSignedOut() {
    restoreGeneration += 1;
    restoredUserId = null;
    await clearMailVaultPassword();
    await clearDerivedVaultKey();
    await clearCachedPrivateKey();
    await clearMailSettings();
    await clearMailListSettings();
    await clearMailOfflineSnapshot();
    resetMailSync();
    clearVaultCache();
    clearSenderKeyCache();
  },
};
