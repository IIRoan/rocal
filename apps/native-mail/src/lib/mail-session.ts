import { bindMailSendOwner, clearMailSendAttempts } from "@workspace/calendar-core";
import { captureSessionDataScope, getSessionDataScope, isSessionDataScopeCurrent, subscribeSessionDataScope } from "@workspace/native-core/lib/session-data-lifecycle";
import type { QueryClient } from "@tanstack/react-query";
import type { AuthLifecycle } from "@workspace/native-core/providers/AuthProvider";
import type { AuthenticatedSessionInput } from "@workspace/native-core/lib/startup-crypto";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import { bootstrapMailboxForAccount } from "./mail/account-bootstrap";
import { clearAttachmentCache } from "./mail/attachment-cache";
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
let launchCleanupDone = false;
let launchCleanup: Promise<void> | null = null;

subscribeSessionDataScope(() => {
  const scope = getSessionDataScope();
  if (scope) bindMailSendOwner(scope.accountId);
});

async function clearLaunchArtifacts(): Promise<void> {
  if (launchCleanupDone) return;
  if (launchCleanup) return launchCleanup;
  const operation = Promise.all([
    clearAttachmentCache(), clearMailVaultPassword(), clearDerivedVaultKey(),
  ]).then(() => { launchCleanupDone = true; }).finally(() => {
    if (launchCleanup === operation) launchCleanup = null;
  });
  launchCleanup = operation;
  return operation;
}

/** Seeds the cache from the encrypted snapshot before E2EE starts, so the mailbox opens without the loading screen. */
export async function restoreMailSession(input: {
  queryClient: QueryClient;
  userId: string;
  isCancelled: () => boolean;
}): Promise<boolean> {
  const scope = captureSessionDataScope(input.userId);
  if (isSessionDataScopeCurrent(scope)) bindMailSendOwner(input.userId);
  const generation = ++restoreGeneration;
  await clearLaunchArtifacts();
  if (!isSessionDataScopeCurrent(scope) || input.isCancelled()) return false;
  const snapshot = await loadMailOfflineSnapshot(input.userId);
  if (!snapshot || input.isCancelled() || generation !== restoreGeneration || !isSessionDataScopeCurrent(scope)) {
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
    queryClient.fetchQuery({
      queryKey: QUERY_KEYS.mailRuntime(),
      queryFn: buildMailRuntime,
      staleTime: 0,
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
  const scope = captureSessionDataScope(input.userId);
  const current = () => isSessionDataScopeCurrent(scope) && !input.isCancelled();
  if (!current()) return;
  bindMailSendOwner(input.userId);
  const setPhase = (phase: string) => { if (current()) input.onPhaseChange?.(phase); };

  // The guard only calls this once E2EE bootstrap settled, so waiting vault unlocks can proceed.
  releaseVaultUnlock();
  // Remove older launches' plaintext files before a restored runtime can expose attachment actions.
  await clearLaunchArtifacts();
  if (!current()) return;
  if (restoredUserId === input.userId) {
    await finishRestoredMailSession(input);
    return;
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

  if (!current()) return;
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

    if (!current()) return;
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
  const emailState = await runtime.client.getEmailState(runtime.session).catch(() => null);
  if (!current()) return;
  setMailSyncState(emailState);

  setPhase("Unlocking encrypted mail…");
  await ensureVaultLoaded(runtime);
}

/** Wipes every vault secret and decrypted copy on sign-out. */
export const MAIL_AUTH_LIFECYCLE: AuthLifecycle = {
  async onSignedOut() {
    clearMailSendAttempts();
    restoreGeneration += 1;
    restoredUserId = null;
    resetMailSync();
    clearVaultCache();
    clearSenderKeyCache();
    const results = await Promise.allSettled([
      clearMailVaultPassword(),
      clearDerivedVaultKey(),
      clearCachedPrivateKey(),
      clearMailSettings(),
      clearMailListSettings(),
      clearMailOfflineSnapshot(),
      clearAttachmentCache(),
    ]);
    if (results.some((result) => result.status === "rejected")) {
      throw new Error(
        "Some local mail data could not be removed. Please retry cleanup.",
      );
    }
  },
};
