export type JmapEmailSetMethodCall = [
  "Email/set",
  Record<string, unknown>,
  string,
];

export type MailMailboxRestore = {
  id: string;
  mailboxIds: Record<string, boolean>;
};

export const EMPTY_MAILBOX_BATCH_SIZE = 100;

export function buildEmailDestroyMethodCall(
  accountId: string,
  messageIds: readonly string[],
): JmapEmailSetMethodCall {
  return ["Email/set", { accountId, destroy: [...messageIds] }, "c1"];
}

export function buildEmailMoveMethodCall(
  accountId: string,
  messageIds: readonly string[],
  targetMailboxId: string,
): JmapEmailSetMethodCall {
  const update = Object.fromEntries(
    messageIds.map((id) => [id, { mailboxIds: { [targetMailboxId]: true } }]),
  );
  return ["Email/set", { accountId, update }, "c1"];
}

/** Puts each message back into exactly the mailboxes it had before a move (undo). */
export function buildEmailRestoreMailboxesMethodCall(
  accountId: string,
  restores: readonly MailMailboxRestore[],
): JmapEmailSetMethodCall {
  const update = Object.fromEntries(
    restores.map(({ id, mailboxIds }) => [id, { mailboxIds: { ...mailboxIds } }]),
  );
  return ["Email/set", { accountId, update }, "c1"];
}

/** Captures current mailbox membership so a later move can be undone; skips messages with none. */
export function collectMailboxRestores(
  messages: readonly { id: string; mailboxIds?: Record<string, boolean> }[],
): MailMailboxRestore[] {
  const seen = new Set<string>();
  const restores: MailMailboxRestore[] = [];
  for (const message of messages) {
    if (seen.has(message.id)) continue;
    const mailboxIds = Object.fromEntries(
      Object.entries(message.mailboxIds ?? {}).filter(([, member]) => member),
    );
    if (Object.keys(mailboxIds).length === 0) continue;
    seen.add(message.id);
    restores.push({ id: message.id, mailboxIds });
  }
  return restores;
}

/** Destroys a mailbox's messages page by page; stops when a batch makes no progress so a refusing server cannot loop forever. */
export async function destroyMailboxMessagesInBatches(input: {
  listIds: (limit: number) => Promise<string[]>;
  destroy: (ids: string[]) => Promise<void>;
  batchSize?: number;
}): Promise<number> {
  const batchSize = input.batchSize ?? EMPTY_MAILBOX_BATCH_SIZE;
  let destroyed = 0;
  let previousBatchKey: string | null = null;

  while (true) {
    const ids = await input.listIds(batchSize);
    if (ids.length === 0) break;
    const batchKey = ids.join("\n");
    if (batchKey === previousBatchKey) break;
    previousBatchKey = batchKey;
    await input.destroy(ids);
    destroyed += ids.length;
    if (ids.length < batchSize) break;
  }

  return destroyed;
}
