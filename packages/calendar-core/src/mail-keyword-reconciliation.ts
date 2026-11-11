/** Local keyword edits (read, star, label) and the reads in flight that could still undo them. */
export type MailKeywordLedger = {
  /** Advances whenever an edit settles, so a read's start tick orders it against every edit. */
  clock: number;
  /** After an overflow no read begun before this tick can be trusted for any message. */
  floor: number;
  /** Writes forgotten by an overflow still block trusting reads until they answer. */
  pendingAfterOverflow: number;
  /** Start ticks of the reads that have not answered yet. */
  reads: number[];
  edits: Map<string, Map<string, MailKeywordEditState>>;
};

type MailKeywordEditState = {
  pending: number;
  settledAt: number;
  /** The value last written, or null once a write failed and the server value is unknown. */
  value: boolean | null;
};

export type MailKeywordEdit = {
  messageId: string;
  keyword: string;
  enabled: boolean;
};

export type MailKeywordGuard = {
  /** Every keyword of a message already shown keeps its local value. */
  keepLocal: boolean;
  /** Per message, the keywords whose local value wins, with the value last written for a message not shown yet. */
  held: ReadonlyMap<string, ReadonlyMap<string, boolean | null>>;
};

type KeywordRow = { id: string; keywords?: Record<string, boolean> | null };

export const MAX_MAIL_KEYWORD_LEDGER_MESSAGES = 1000;
export const MAX_MAIL_KEYWORD_LEDGER_READS = 32;

export function createMailKeywordLedger(): MailKeywordLedger {
  return {
    clock: 0,
    floor: 0,
    pendingAfterOverflow: 0,
    reads: [],
    edits: new Map(),
  };
}

/** Past a cap nothing is dropped unguarded: every read already begun becomes untrusted for every message instead. */
function collapseLedger(ledger: MailKeywordLedger): void {
  for (const keys of ledger.edits.values())
    for (const state of keys.values())
      ledger.pendingAfterOverflow += state.pending;
  ledger.edits.clear();
  ledger.reads.length = 0;
  ledger.floor = ++ledger.clock;
}

/** An edit is only needed while a write, or a read begun before it settled, is still in flight. */
function pruneSettledEdits(ledger: MailKeywordLedger): void {
  const oldestRead = ledger.reads.reduce(
    (oldest, startedAt) => Math.min(oldest, startedAt),
    ledger.clock,
  );
  for (const [messageId, keys] of [...ledger.edits]) {
    for (const [keyword, state] of [...keys]) {
      if (state.pending === 0 && state.settledAt <= oldestRead)
        keys.delete(keyword);
    }
    if (keys.size === 0) ledger.edits.delete(messageId);
  }
}

/** Records edits as in flight; call the returned function once when the write has answered. */
export function beginMailKeywordEdits(
  ledger: MailKeywordLedger,
  edits: readonly MailKeywordEdit[],
): (succeeded: boolean) => void {
  const states: MailKeywordEditState[] = [];
  for (const edit of edits) {
    let keys = ledger.edits.get(edit.messageId);
    if (!keys) {
      if (ledger.edits.size >= MAX_MAIL_KEYWORD_LEDGER_MESSAGES)
        collapseLedger(ledger);
      keys = new Map();
      ledger.edits.set(edit.messageId, keys);
    }
    const state = keys.get(edit.keyword) ?? {
      pending: 0,
      settledAt: 0,
      value: null,
    };
    state.pending += 1;
    state.value = edit.enabled;
    keys.set(edit.keyword, state);
    states.push(state);
  }
  return (succeeded) => {
    const settledAt = ++ledger.clock;
    edits.forEach((edit, index) => {
      const state = states[index];
      if (!state) return;
      state.pending -= 1;
      state.settledAt = settledAt;
      if (!succeeded) state.value = null;
      // An entry dropped by an overflow still settled now, so reads begun before now stay untrusted.
      if (ledger.edits.get(edit.messageId)?.get(edit.keyword) !== state) {
        ledger.pendingAfterOverflow -= 1;
        ledger.floor = settledAt;
      }
    });
    pruneSettledEdits(ledger);
  };
}

/** Registers a read this client is about to start; pass the tick to the guard and to `endMailKeywordRead`. */
export function beginMailKeywordRead(ledger: MailKeywordLedger): number {
  if (ledger.reads.length >= MAX_MAIL_KEYWORD_LEDGER_READS)
    collapseLedger(ledger);
  ledger.reads.push(ledger.clock);
  return ledger.clock;
}

/** Call once the read has answered and been merged, whether it succeeded or not. */
export function endMailKeywordRead(
  ledger: MailKeywordLedger,
  startedAt: number,
): void {
  const index = ledger.reads.indexOf(startedAt);
  if (index >= 0) ledger.reads.splice(index, 1);
  pruneSettledEdits(ledger);
}

export function hasPendingMailKeywordEdit(
  ledger: MailKeywordLedger,
  messageId: string,
): boolean {
  if (ledger.pendingAfterOverflow > 0) return true;
  const keys = ledger.edits.get(messageId);
  if (!keys) return false;
  for (const state of keys.values()) if (state.pending > 0) return true;
  return false;
}

/** Which local keyword values a server answer must not replace; `startedAt` is null for a snapshot this client did not read itself. */
export function planMailKeywordMerge(
  ledger: MailKeywordLedger,
  messageIds: readonly string[],
  startedAt: number | null,
): MailKeywordGuard {
  const held = new Map<string, Map<string, boolean | null>>();
  for (const messageId of messageIds) {
    const keys = ledger.edits.get(messageId);
    if (!keys) continue;
    const heldKeys = new Map<string, boolean | null>();
    keys.forEach((state, keyword) => {
      if (
        startedAt === null ||
        state.pending > 0 ||
        state.settledAt > startedAt
      )
        heldKeys.set(keyword, state.value);
    });
    if (heldKeys.size > 0) held.set(messageId, heldKeys);
  }
  // Nothing orders a pushed or relayed snapshot against local edits, so it never replaces a keyword already shown.
  return {
    keepLocal:
      startedAt === null ||
      startedAt < ledger.floor ||
      ledger.pendingAfterOverflow > 0,
    held,
  };
}

/** A server row with the guarded keywords put back to what this client shows, or last wrote. */
export function guardMailKeywords<T extends KeywordRow>(
  incoming: T,
  local: T | undefined,
  guard: MailKeywordGuard,
): T {
  if (local && guard.keepLocal)
    return { ...incoming, keywords: local.keywords };
  const held = guard.held.get(incoming.id);
  if (!held) return incoming;
  const keywords: Record<string, boolean> = { ...(incoming.keywords ?? {}) };
  held.forEach((written, keyword) => {
    const enabled = local ? local.keywords?.[keyword] === true : written;
    if (enabled === null) return;
    if (enabled) keywords[keyword] = true;
    else delete keywords[keyword];
  });
  return { ...incoming, keywords };
}

/** Whether two rows show different keywords; a keyword set to false counts as absent. */
export function mailKeywordsDiffer(
  left: KeywordRow,
  right: KeywordRow,
): boolean {
  const enabled = (row: KeywordRow) =>
    Object.keys(row.keywords ?? {})
      .filter((keyword) => row.keywords?.[keyword] === true)
      .sort()
      .join("\n");
  return enabled(left) !== enabled(right);
}
