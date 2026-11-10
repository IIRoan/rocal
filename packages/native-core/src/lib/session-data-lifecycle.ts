import { createLogger } from "@workspace/logger";

const log = createLogger("session-data");

export type SessionDataScope = Readonly<{
  accountId: string;
  generation: number;
}>;

let active: SessionDataScope | null = null;
let generation = 0;
const stores = new Set<() => Promise<void>>();
const listeners = new Set<() => void>();

export function subscribeSessionDataScope(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSessionDataScope(): SessionDataScope | null {
  return active;
}

function notifySessionData() {
  for (const listener of listeners) listener();
}

export function captureSessionDataScope(
  accountId?: string,
): SessionDataScope | null {
  return active && (!accountId || active.accountId === accountId)
    ? active
    : null;
}

export function isSessionDataScopeCurrent(
  scope: SessionDataScope | null,
): boolean {
  return scope !== null && scope === active;
}

export function activateSessionData(accountId: string): void {
  if (active?.accountId === accountId) return;
  if (active) void closeSessionData().catch(() => log.warn("Local session cleanup will retry before writing"));
  active = { accountId, generation: ++generation };
  notifySessionData();
}

/** Suspension invalidates pending work without removing data needed by an unexpired offline session. */
export function suspendSessionData(): void {
  active = null;
  generation += 1;
  notifySessionData();
}

/** Invalidation happens before any asynchronous cleanup, including debounced work that has not started yet. */
export function closeSessionData(): Promise<void> {
  suspendSessionData();
  return Promise.allSettled([...stores].map((clear) => clear())).then(
    (results) => {
      if (results.some((result) => result.status === "rejected")) {
        throw new Error(
          "Some local session data could not be removed. Cleanup will retry.",
        );
      }
    },
  );
}

/** Serializes each store's physical writes and wipes; a failed wipe blocks writes until cleanup succeeds. */
export function createSessionDataStore(cleanup: () => Promise<void>) {
  let tail: Promise<unknown> = Promise.resolve();
  let epoch = 0;
  let cleanupPending = false;
  const serial = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = tail.then(operation);
    tail = result.catch(() => undefined);
    return result;
  };
  const clean = async () => {
    await cleanup();
    cleanupPending = false;
  };
  const clear = () => {
    epoch += 1;
    cleanupPending = true;
    return serial(clean);
  };
  stores.add(clear);
  return {
    clear,
    serialize: serial,
    capture: (accountId?: string) => {
      const scope = captureSessionDataScope(accountId);
      const startedAt = epoch;
      return {
        scope,
        isCurrent: () =>
          isSessionDataScopeCurrent(scope) && startedAt === epoch,
      };
    },
    run: <T>(
      isCurrent: () => boolean,
      operation: () => Promise<T>,
    ): Promise<T | undefined> =>
      serial(async () => {
        if (!isCurrent()) return undefined;
        if (cleanupPending) await clean();
        if (!isCurrent()) return undefined;
        const result = await operation();
        return isCurrent() ? result : undefined;
      }),
  };
}
