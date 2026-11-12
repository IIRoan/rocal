"use client";

import {
  useEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  beginMailKeywordEdits,
  beginMailKeywordRead,
  createMailKeywordLedger,
  endMailKeywordRead,
  guardMailKeywords,
  hasPendingMailKeywordEdit,
  mailKeywordsDiffer,
  MAX_MAIL_KEYWORD_LEDGER_MESSAGES,
  planMailKeywordMerge,
  type MailKeywordEdit,
  type MailKeywordGuard,
  type MailKeywordLedger,
} from "@workspace/calendar-core";
import { createLogger } from "@workspace/logger";
import { getPrimaryMailAccountId } from "@/lib/mail/jmap-client";
import type { ActiveMailboxState } from "@/lib/mail/mail-app-helpers";
import type { JmapEmailMessage } from "@/lib/mail/types";

const log = createLogger("mail-keyword-reconciliation");

type AccountKeywordState = {
  accountId: string;
  ledger: MailKeywordLedger;
  /** Rows a snapshot disagreed with, waiting for a read this client starts itself. */
  awaiting: Set<string>;
  /** Set when `awaiting` overflowed: every row shown is read instead, so no disagreement is forgotten. */
  awaitingAll: boolean;
  reading: boolean;
};

export type MailKeywordRead = { ledger: MailKeywordLedger; startedAt: number };

/** Settles the edits whether the write resolves or rejects, then passes its outcome on. */
async function settleAfter<T>(
  write: () => Promise<T>,
  settle: (succeeded: boolean) => void,
): Promise<T> {
  let succeeded = false;
  try {
    const value = await write();
    succeeded = true;
    return value;
  } finally {
    settle(succeeded);
  }
}

function awaitRow(state: AccountKeywordState, messageId: string): void {
  if (state.awaitingAll) return;
  if (state.awaiting.size >= MAX_MAIL_KEYWORD_LEDGER_MESSAGES) {
    state.awaiting.clear();
    state.awaitingAll = true;
  } else state.awaiting.add(messageId);
}

/** Takes the awaited rows that are still shown and have no write in flight; a row with one waits for it. */
function takeReadableIds(
  state: AccountKeywordState,
  shown: JmapEmailMessage[],
): string[] {
  const wanted = shown
    .map((message) => message.id)
    .filter((id) => state.awaitingAll || state.awaiting.has(id));
  state.awaiting.clear();
  state.awaitingAll = false;
  const ids: string[] = [];
  for (const id of wanted) {
    if (hasPendingMailKeywordEdit(state.ledger, id)) awaitRow(state, id);
    else ids.push(id);
  }
  return ids;
}

/** Keeps local read, star and label edits from being undone by a server answer that was read before they settled. */
export function useMailKeywordReconciliation(input: {
  /** The account of the mailbox that is open; a change retires everything recorded for the previous one. */
  accountId: string | null;
  activeMailboxRef: RefObject<ActiveMailboxState | null>;
  setActiveMailbox: Dispatch<SetStateAction<ActiveMailboxState | null>>;
}) {
  const {
    accountId: openAccountId,
    activeMailboxRef,
    setActiveMailbox,
  } = input;
  const stateRef = useRef<AccountKeywordState | null>(null);

  useEffect(
    () => () => {
      stateRef.current = null;
    },
    [openAccountId],
  );

  /** The state of the mailbox that is open now; another account or a sign-out starts from nothing. */
  const activeState = (): AccountKeywordState | null => {
    const mailbox = activeMailboxRef.current;
    const accountId = mailbox ? getPrimaryMailAccountId(mailbox.session) : null;
    if (!accountId) {
      stateRef.current = null;
      return null;
    }
    if (stateRef.current?.accountId !== accountId)
      stateRef.current = {
        accountId,
        ledger: createMailKeywordLedger(),
        awaiting: new Set(),
        awaitingAll: false,
        reading: false,
      };
    return stateRef.current;
  };

  /** Reads the awaited rows afresh; only an answer begun after a row's edits settled may replace its keywords. */
  const readAwaitedKeywords = async (): Promise<void> => {
    const state = activeState();
    if (!state || state.reading) return;
    state.reading = true;
    while (true) {
      const mailbox = activeMailboxRef.current;
      // The open mailbox is asked again each round: an account switch or sign-out needs no call here to end this loop.
      if (!mailbox || activeState() !== state) break;
      const ids = takeReadableIds(state, mailbox.messages);
      if (ids.length === 0) break;
      const startedAt = beginMailKeywordRead(state.ledger);
      const records = await mailbox.client
        .getMessagesByIds(mailbox.session, ids, { includeBodies: false })
        .catch((error: unknown) => {
          log.warn("Could not confirm mail keywords", error);
          return null;
        });
      const guard = planMailKeywordMerge(state.ledger, ids, startedAt);
      endMailKeywordRead(state.ledger, startedAt);
      if (activeState() !== state) break;
      if (!records) {
        // A later snapshot or edit retries these rows; looping here would hammer a failing connection.
        for (const id of ids) awaitRow(state, id);
        break;
      }
      // An edit that raced this read keeps its row waiting for the next one.
      for (const id of guard.keepLocal ? ids : guard.held.keys())
        awaitRow(state, id);
      const byId = new Map<string, JmapEmailMessage>();
      for (const record of records) byId.set(record.id, record);
      // Only rows still in the list are touched, so an answer can never bring back one that was moved or deleted meanwhile.
      setActiveMailbox((current) => {
        if (
          !current ||
          getPrimaryMailAccountId(current.session) !== state.accountId
        )
          return current;
        return {
          ...current,
          messages: current.messages.map((message) => {
            const record = byId.get(message.id);
            if (!record) return message;
            const keywords = guardMailKeywords(record, message, guard).keywords;
            return mailKeywordsDiffer({ id: message.id, keywords }, message)
              ? { ...message, keywords }
              : message;
          }),
        };
      });
    }
    state.reading = false;
  };

  const confirmAwaitedKeywords = () => {
    void readAwaitedKeywords().catch((error: unknown) =>
      log.warn("Could not confirm mail keywords", error),
    );
  };

  /** Runs a keyword write with its edits on record, so no answer read before it settles can undo them. */
  const trackWrite = <T>(
    edits: MailKeywordEdit[],
    write: () => Promise<T>,
  ): Promise<T> => {
    const state = activeState();
    const settle = state
      ? beginMailKeywordEdits(state.ledger, edits)
      : () => undefined;
    return settleAfter(write, (succeeded) => {
      settle(succeeded);
      confirmAwaitedKeywords();
    });
  };

  /** Call before a list or message read this client starts; null when no mailbox is open. */
  const beginRead = (): MailKeywordRead | null => {
    const state = activeState();
    return state
      ? {
          ledger: state.ledger,
          startedAt: beginMailKeywordRead(state.ledger),
        }
      : null;
  };

  /** The guard for the rows a finished read returned; call exactly once per `beginRead`, also when the read failed. */
  const endRead = (
    read: MailKeywordRead | null,
    messageIds: string[],
  ): MailKeywordGuard | undefined => {
    if (!read) return undefined;
    const guard = planMailKeywordMerge(read.ledger, messageIds, read.startedAt);
    endMailKeywordRead(read.ledger, read.startedAt);
    // A read begun for a mailbox that is no longer open has nothing to guard.
    const state = activeState();
    if (state?.ledger !== read.ledger) return undefined;
    // A guarded page still owes a fresh read of the keyword changes it could not apply.
    if (guard.keepLocal || guard.held.size > 0) {
      for (const id of guard.keepLocal ? messageIds : guard.held.keys())
        awaitRow(state, id);
      confirmAwaitedKeywords();
    }
    return guard;
  };

  /** The guard for a sync snapshot, which this client did not read itself: rows it disagrees with are read afresh instead. */
  const guardSnapshot = (
    accountId: string,
    records: JmapEmailMessage[],
  ): MailKeywordGuard | undefined => {
    const state = activeState();
    const mailbox = activeMailboxRef.current;
    if (!state || !mailbox || state.accountId !== accountId) return undefined;
    const shown = new Map<string, JmapEmailMessage>();
    for (const message of mailbox.messages) shown.set(message.id, message);
    for (const record of records) {
      const local = shown.get(record.id);
      if (local && mailKeywordsDiffer(record, local))
        awaitRow(state, record.id);
    }
    confirmAwaitedKeywords();
    return planMailKeywordMerge(
      state.ledger,
      records.map((record) => record.id),
      null,
    );
  };

  const reset = () => {
    stateRef.current = null;
  };

  return { trackWrite, beginRead, endRead, guardSnapshot, reset };
}
