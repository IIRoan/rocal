import type { QueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import {
  flattenMailboxMessagesCache,
  patchMailboxMessagesCache,
  removeMessagesFromMailboxCache,
  type MailboxMessagesCacheData,
} from "./mail-message-cache";
import type { MailRuntime } from "./mail-runtime";
import type { JmapEmailMessage, JmapEmailPlacement } from "./types";

/** Past this many Email/changes pages a full refetch is cheaper than replaying the delta. */
const MAX_CHANGE_PAGES = 5;
/** Above this many changed cached messages, skip the placement lookup and let the list refetch settle them. */
const MAX_PLACEMENT_LOOKUPS = 500;

let emailState: string | null = null;
let inflight: Promise<void> | null = null;

export function getMailSyncState(): string | null {
  return emailState;
}

export function setMailSyncState(state: string | null): void {
  emailState = state;
}

export function resetMailSync(): void {
  emailState = null;
  inflight = null;
}

type EmailDelta = {
  newState: string;
  created: string[];
  updated: string[];
  destroyed: string[];
};

async function readEmailDelta(
  runtime: MailRuntime,
  sinceState: string,
): Promise<EmailDelta | null> {
  let state = sinceState;
  const delta: Omit<EmailDelta, "newState"> = {
    created: [],
    updated: [],
    destroyed: [],
  };
  for (let page = 0; page < MAX_CHANGE_PAGES; page += 1) {
    const changes = await runtime.client.getEmailChanges(
      runtime.session,
      state,
    );
    delta.created.push(...changes.created);
    delta.updated.push(...changes.updated);
    delta.destroyed.push(...changes.destroyed);
    state = changes.newState;
    if (!changes.hasMoreChanges) {
      return { ...delta, newState: state };
    }
  }
  return null;
}

function isDetailKey(key: readonly unknown[]): boolean {
  return key.length === 3 && key[0] === "mail" && key[1] === "message";
}

function cachedMessageIds(queryClient: QueryClient): Set<string> {
  const ids = new Set<string>();
  for (const [, data] of queryClient.getQueriesData<MailboxMessagesCacheData>({
    queryKey: QUERY_KEYS.mailMessagesAll(),
  })) {
    for (const message of flattenMailboxMessagesCache(data)) ids.add(message.id);
  }
  for (const [, messages] of queryClient.getQueriesData<JmapEmailMessage[]>({
    queryKey: QUERY_KEYS.mailThreadsAll(),
  })) {
    for (const message of messages ?? []) ids.add(message.id);
  }
  for (const query of queryClient
    .getQueryCache()
    .findAll({ predicate: ({ queryKey }) => isDetailKey(queryKey) })) {
    ids.add(query.queryKey[2] as string);
  }
  return ids;
}

function placementPatch(
  placement: JmapEmailPlacement,
): Partial<JmapEmailMessage> {
  return { mailboxIds: placement.mailboxIds, keywords: placement.keywords };
}

/** Applies other devices' deletes, moves and read/flag changes to every cached copy right away. */
export function applyMailChanges(
  queryClient: QueryClient,
  gone: ReadonlySet<string>,
  placements: ReadonlyMap<string, JmapEmailPlacement>,
): void {
  const placed = new Set(placements.keys());
  const patch = (message: JmapEmailMessage) => {
    const placement = placements.get(message.id);
    return placement ? placementPatch(placement) : {};
  };

  for (const [key, data] of queryClient.getQueriesData<MailboxMessagesCacheData>({
    queryKey: QUERY_KEYS.mailMessagesAll(),
  })) {
    const mailboxId = key[2];
    if (!data || typeof mailboxId !== "string") continue;
    const movedOut = new Set(gone);
    for (const [id, placement] of placements) {
      if (!placement.mailboxIds?.[mailboxId]) movedOut.add(id);
    }
    const patched = patchMailboxMessagesCache(data, placed, patch) ?? data;
    const next = removeMessagesFromMailboxCache(patched, movedOut) ?? patched;
    if (next !== data) queryClient.setQueryData(key, next);
  }

  for (const [key, messages] of queryClient.getQueriesData<JmapEmailMessage[]>({
    queryKey: QUERY_KEYS.mailThreadsAll(),
  })) {
    if (!messages) continue;
    let changed = false;
    const next = messages.flatMap((message) => {
      if (gone.has(message.id)) {
        changed = true;
        return [];
      }
      const placement = placements.get(message.id);
      if (!placement) return [message];
      changed = true;
      return [{ ...message, ...placementPatch(placement) }];
    });
    if (changed) queryClient.setQueryData(key, next);
  }

  for (const [id, placement] of placements) {
    const key = QUERY_KEYS.mailMessage(id);
    const detail = queryClient.getQueryData<JmapEmailMessage | null>(key);
    if (detail) queryClient.setQueryData(key, { ...detail, ...placementPatch(placement) });
  }
  // Open screens keep their copy and resolve the removal on their own refetch.
  for (const id of gone) {
    queryClient.removeQueries({ queryKey: QUERY_KEYS.mailMessage(id), exact: true, type: "inactive" });
    queryClient.removeQueries({ queryKey: QUERY_KEYS.mailDecrypted(id), exact: true, type: "inactive" });
  }
}

/** Marks every mail list and thread stale, refetching only the ones on screen so hidden lists refresh when next opened. */
async function refreshChangedMail(
  queryClient: QueryClient,
  changedMessageIds: string[],
): Promise<void> {
  const changed = new Set(changedMessageIds);
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.mailMessagesAll(),
      refetchType: "active",
    }),
    queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.mailThreadsAll(),
      refetchType: "active",
    }),
    changed.size > 0
      ? queryClient.invalidateQueries({
          predicate: ({ queryKey }) =>
            isDetailKey(queryKey) && changed.has(queryKey[2] as string),
          refetchType: "active",
        })
      : Promise.resolve(),
  ]);
}

async function readPlacements(
  runtime: MailRuntime,
  ids: string[],
): Promise<{ list: JmapEmailPlacement[]; notFound: string[] }> {
  if (ids.length === 0 || ids.length > MAX_PLACEMENT_LOOKUPS) {
    return { list: [], notFound: [] };
  }
  return runtime.client
    .getEmailPlacements(runtime.session, ids)
    .catch(() => ({ list: [], notFound: [] }));
}

async function runMailboxSync(
  queryClient: QueryClient,
  runtime: MailRuntime,
): Promise<void> {
  const since = emailState;
  const delta = since
    ? await readEmailDelta(runtime, since).catch(() => null)
    : null;

  if (!delta) {
    // No usable baseline (first run, server state reset, or too many changes): re-anchor, then refresh everything.
    emailState = await runtime.client.getEmailState(runtime.session);
    // Hidden threads could still hold removed mail that feeds conversation grouping; drop them instead of trusting them.
    queryClient.removeQueries({
      queryKey: QUERY_KEYS.mailThreadsAll(),
      type: "inactive",
    });
    await refreshChangedMail(queryClient, []);
    return;
  }

  if (
    delta.created.length === 0 &&
    delta.updated.length === 0 &&
    delta.destroyed.length === 0
  ) {
    emailState = delta.newState;
    return;
  }

  const cached = cachedMessageIds(queryClient);
  const placements = await readPlacements(
    runtime,
    delta.updated.filter((id) => cached.has(id)),
  );
  // A mutation started meanwhile owns the cache; keep the old state so the next run replays this delta.
  if (queryClient.isMutating() > 0) return;

  emailState = delta.newState;
  applyMailChanges(
    queryClient,
    new Set([...delta.destroyed, ...placements.notFound]),
    new Map(placements.list.map((placement) => [placement.id, placement])),
  );
  await refreshChangedMail(queryClient, [...delta.destroyed, ...delta.updated]);
}

/** Silent background reconcile against the server via JMAP Email/changes; one run at a time, skipped while a mutation owns the cache. */
export function syncMailboxChanges(
  queryClient: QueryClient,
  runtime: MailRuntime,
): Promise<void> {
  if (inflight) return inflight;
  if (queryClient.isMutating() > 0) return Promise.resolve();
  const run = runMailboxSync(queryClient, runtime).finally(() => {
    if (inflight === run) inflight = null;
  });
  inflight = run;
  return run;
}
