import type { CalendarApiService } from "./calendar-api-service";
import { sealReadableInvitations } from "./event-search-corpus";

const BATCH_SIZE = 4;

type UpgradeApi = Pick<
  CalendarApiService,
  | "getEncryptionUpgrades"
  | "ensureSealedUserSettings"
  | "getEventSearchCorpus"
  | "sealImportedInvitationIfNeeded"
  | "resealEventAttributes"
  | "sealPendingReminders"
  | "getSubscriptions"
  | "updateSubscription"
>;

/** Small batches keep a large backlog from flooding the API; a failed id waits for the next start. */
async function inBatches(
  ids: string[],
  run: (id: string) => Promise<boolean>,
): Promise<void> {
  for (let index = 0; index < ids.length; index += BATCH_SIZE) {
    await Promise.all(
      ids.slice(index, index + BATCH_SIZE).map((id) => run(id).catch(() => false)),
    );
  }
}

/** Renaming a feed to its own name stores it sealed; one list read finds every name. */
async function sealSubscriptionNames(api: UpgradeApi, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const names = new Map(
    (await api.getSubscriptions()).map((subscription) => [subscription.id, subscription.name.trim()]),
  );
  await inBatches(ids, async (id) => {
    const name = names.get(id);
    if (!name) return false;
    await api.updateSubscription(id, { name });
    return true;
  });
}

/** Re-seals what the server reports this account still stores in an older form; true when the settings were sealed. */
export async function upgradeStoredEncryption(api: UpgradeApi): Promise<boolean> {
  const report = await api.getEncryptionUpgrades();
  const settingsSealed = report.unsealedSettings
    ? await api.ensureSealedUserSettings().catch(() => false)
    : false;
  if (report.readableInvitations > 0) {
    await sealReadableInvitations(api).catch(() => undefined);
  }
  await inBatches(report.eventsWithReadableAttributes, (id) =>
    api.resealEventAttributes(id),
  );
  await inBatches(report.eventsWithUnsealedReminders, (id) =>
    api.sealPendingReminders(id),
  );
  await sealSubscriptionNames(api, report.subscriptionsWithReadableNames).catch(
    () => undefined,
  );
  return settingsSealed;
}
