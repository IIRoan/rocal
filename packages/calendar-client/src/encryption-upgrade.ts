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
  | "markEventContentBound"
  | "sealPendingReminders"
  | "getSubscriptions"
  | "getUnboundSubscriptionUrls"
  | "updateSubscription"
>;

/** Small batches keep a large backlog from flooding the API; a failed id waits for the next start. */
async function inBatches<T>(
  items: T[],
  run: (item: T) => Promise<boolean>,
): Promise<void> {
  for (let index = 0; index < items.length; index += BATCH_SIZE) {
    await Promise.all(
      items
        .slice(index, index + BATCH_SIZE)
        .map((item) => run(item).catch(() => false)),
    );
  }
}

/** The name revision keeps background sealing from replacing a newer rename. */
async function sealSubscriptionNames(
  api: UpgradeApi,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const subscriptions = new Map(
    (await api.getSubscriptions()).map((subscription) => [
      subscription.id,
      subscription,
    ]),
  );
  await inBatches(ids, async (id) => {
    const subscription = subscriptions.get(id);
    const name = subscription?.name.trim();
    const expectedNameRevision = subscription?.nameRevision;
    if (!name || !expectedNameRevision) return false;
    await api.updateSubscription(id, { name, expectedNameRevision });
    return true;
  });
}

/** Re-saving a readable feed URL seals it into `encryptedUrl` and leaves the server only a placeholder. */
async function sealSubscriptionUrls(
  api: UpgradeApi,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const subscriptions = new Map(
    (await api.getSubscriptions()).map((subscription) => [
      subscription.id,
      subscription,
    ]),
  );
  await inBatches(ids, async (id) => {
    const subscription = subscriptions.get(id);
    const url = subscription?.encryptedUrl ? undefined : subscription?.url.trim();
    if (!url) return false;
    await api.updateSubscription(id, { url });
    return true;
  });
}

/** Re-seals feed URLs sealed before they were bound to their feed; true when none is left. */
async function bindSubscriptionUrls(api: UpgradeApi): Promise<boolean> {
  const unbound = await api.getUnboundSubscriptionUrls();
  let left = unbound.length;
  await inBatches(unbound, async ({ id, url }) => {
    await api.updateSubscription(id, { url });
    left -= 1;
    return true;
  });
  return left === 0;
}

/** Re-seals what the server reports this account still stores in an older form; true when the settings were sealed. */
export async function upgradeStoredEncryption(
  api: UpgradeApi,
): Promise<boolean> {
  const report = await api.getEncryptionUpgrades();
  const settingsSealed = report.unsealedSettings
    ? await api.ensureSealedUserSettings().catch(() => false)
    : false;
  if (report.readableInvitations > 0) {
    await sealReadableInvitations(api).catch(() => undefined);
  }
  // A re-seal binds the content to its id and moves readable colour and category inside, so each event needs one.
  const resealed = [
    ...new Set([
      ...report.eventsWithReadableAttributes,
      ...report.eventsWithUnboundContent,
    ]),
  ];
  await inBatches(resealed, (id) => api.resealEventAttributes(id));
  const urlsBound = await bindSubscriptionUrls(api).catch(() => false);
  // Once nothing unbound is left, trash and feed URLs included, unbound content is refused here and on the account's other devices.
  if (
    report.eventsWithUnboundContent.length === 0 &&
    report.trashWithUnboundContent === 0 &&
    urlsBound
  ) {
    await api.markEventContentBound().catch(() => undefined);
  }
  await inBatches(report.eventsWithUnsealedReminders, (id) =>
    api.sealPendingReminders(id),
  );
  await sealSubscriptionNames(api, report.subscriptionsWithReadableNames).catch(
    () => undefined,
  );
  await sealSubscriptionUrls(api, report.subscriptionsWithReadableUrls).catch(
    () => undefined,
  );
  return settingsSealed;
}
