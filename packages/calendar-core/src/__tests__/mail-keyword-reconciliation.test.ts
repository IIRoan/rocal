import {
  beginMailKeywordEdits,
  beginMailKeywordRead,
  createMailKeywordLedger,
  endMailKeywordRead,
  guardMailKeywords,
  hasPendingMailKeywordEdit,
  mailKeywordsDiffer,
  MAX_MAIL_KEYWORD_LEDGER_EDITS,
  MAX_MAIL_KEYWORD_LEDGER_MESSAGES,
  MAX_MAIL_KEYWORD_LEDGER_READS,
  planMailKeywordMerge,
  type MailKeywordLedger,
} from "../mail-keyword-reconciliation";

type Row = { id: string; keywords?: Record<string, boolean> };

const star = (messageId: string, enabled = true) => ({
  messageId,
  keyword: "$flagged",
  enabled,
});
const seen = (messageId: string, enabled = true) => ({
  messageId,
  keyword: "$seen",
  enabled,
});

/** What the list shows after a server row is merged over the local row. */
function merged(
  ledger: MailKeywordLedger,
  local: Row | undefined,
  incoming: Row,
  startedAt: number | null,
) {
  const guard = planMailKeywordMerge(ledger, [incoming.id], startedAt);
  return guardMailKeywords(incoming, local, guard).keywords;
}

it("lets a read through untouched when nothing was edited here", () => {
  const ledger = createMailKeywordLedger();
  const startedAt = beginMailKeywordRead(ledger);
  const incoming: Row = { id: "m1", keywords: { $seen: true } };
  const guard = planMailKeywordMerge(ledger, ["m1"], startedAt);
  expect(guardMailKeywords(incoming, { id: "m1" }, guard)).toBe(incoming);
});

it("keeps a star while its write is in flight", () => {
  const ledger = createMailKeywordLedger();
  const startedAt = beginMailKeywordRead(ledger);
  beginMailKeywordEdits(ledger, [star("m1")]);
  const local = { id: "m1", keywords: { $flagged: true } };
  expect(merged(ledger, local, { id: "m1", keywords: {} }, startedAt)).toEqual({
    $flagged: true,
  });
  expect(hasPendingMailKeywordEdit(ledger, "m1")).toBe(true);
});

it("keeps an edit that finished before a read begun earlier came back", () => {
  const ledger = createMailKeywordLedger();
  const startedAt = beginMailKeywordRead(ledger);
  beginMailKeywordEdits(ledger, [seen("m1", false)])(true);
  const local = { id: "m1", keywords: {} };
  expect(
    merged(ledger, local, { id: "m1", keywords: { $seen: true } }, startedAt),
  ).toEqual({});
  expect(hasPendingMailKeywordEdit(ledger, "m1")).toBe(false);
});

it("trusts a read begun after the edit settled, so another device's later change shows", () => {
  const ledger = createMailKeywordLedger();
  const earlier = beginMailKeywordRead(ledger);
  beginMailKeywordEdits(ledger, [star("m1")])(true);
  const startedAt = beginMailKeywordRead(ledger);
  const local = { id: "m1", keywords: { $flagged: true } };
  expect(merged(ledger, local, { id: "m1", keywords: {} }, startedAt)).toEqual(
    {},
  );
  expect(merged(ledger, local, { id: "m1", keywords: {} }, earlier)).toEqual({
    $flagged: true,
  });
});

it("never lets a snapshot this client did not read replace a keyword already shown", () => {
  const ledger = createMailKeywordLedger();
  const local = { id: "m1", keywords: { $flagged: true } };
  expect(merged(ledger, local, { id: "m1", keywords: {} }, null)).toEqual({
    $flagged: true,
  });
  expect(
    merged(ledger, undefined, { id: "new", keywords: { $seen: true } }, null),
  ).toEqual({ $seen: true });
});

it("guards only the edited keyword, so a remote change to another keyword still arrives", () => {
  const ledger = createMailKeywordLedger();
  const startedAt = beginMailKeywordRead(ledger);
  beginMailKeywordEdits(ledger, [seen("m1")])(true);
  const local = { id: "m1", keywords: { $seen: true } };
  expect(
    merged(
      ledger,
      local,
      { id: "m1", keywords: { $flagged: true } },
      startedAt,
    ),
  ).toEqual({ $seen: true, $flagged: true });
});

it("forgets an edit once its write and every read begun before it settled have answered", () => {
  const ledger = createMailKeywordLedger();
  const first = beginMailKeywordRead(ledger);
  const second = beginMailKeywordRead(ledger);
  const settle = beginMailKeywordEdits(ledger, [star("m1")]);
  endMailKeywordRead(ledger, first);
  expect(ledger.edits.has("m1")).toBe(true);
  settle(true);
  expect(ledger.edits.has("m1")).toBe(true);
  endMailKeywordRead(ledger, second);
  expect(ledger.edits.size).toBe(0);
  expect(ledger.reads).toEqual([]);
});

it("forgets a settled edit at once when no read is in flight", () => {
  const ledger = createMailKeywordLedger();
  beginMailKeywordEdits(ledger, [star("m1"), seen("m2")])(true);
  expect(ledger.edits.size).toBe(0);
});

it("keeps what the list shows after a failed write, including a rollback", () => {
  const ledger = createMailKeywordLedger();
  const startedAt = beginMailKeywordRead(ledger);
  beginMailKeywordEdits(ledger, [star("m1")])(false);
  const rolledBack = { id: "m1", keywords: {} };
  expect(
    merged(
      ledger,
      rolledBack,
      { id: "m1", keywords: { $flagged: true } },
      startedAt,
    ),
  ).toEqual({});
  expect(
    merged(
      ledger,
      undefined,
      { id: "m1", keywords: { $flagged: true } },
      startedAt,
    ),
  ).toEqual({ $flagged: true });
});

it("applies the value last written to a message that is not in the list yet", () => {
  const ledger = createMailKeywordLedger();
  beginMailKeywordRead(ledger);
  beginMailKeywordEdits(ledger, [seen("m1", false), star("m1")])(true);
  expect(
    merged(ledger, undefined, { id: "m1", keywords: { $seen: true } }, null),
  ).toEqual({ $flagged: true });
});

it("stays bounded: past the cap every read begun earlier keeps local keywords", () => {
  const ledger = createMailKeywordLedger();
  const before = beginMailKeywordRead(ledger);
  const settleFirst = beginMailKeywordEdits(ledger, [star("first")]);
  const others: Array<(succeeded: boolean) => void> = [];
  for (let index = 0; index < MAX_MAIL_KEYWORD_LEDGER_MESSAGES; index += 1)
    others.push(beginMailKeywordEdits(ledger, [star(`m${index}`)]));
  expect(ledger.edits.size).toBeLessThanOrEqual(
    MAX_MAIL_KEYWORD_LEDGER_MESSAGES,
  );
  expect(ledger.edits.has("first")).toBe(false);

  const local = { id: "first", keywords: { $flagged: true } };
  expect(merged(ledger, local, { id: "first", keywords: {} }, before)).toEqual({
    $flagged: true,
  });

  const whilePending = beginMailKeywordRead(ledger);
  settleFirst(true);
  expect(planMailKeywordMerge(ledger, ["first"], whilePending).keepLocal).toBe(
    true,
  );
  expect(hasPendingMailKeywordEdit(ledger, "first")).toBe(true);
  for (const settle of others) settle(true);
  const fresh = beginMailKeywordRead(ledger);
  expect(merged(ledger, local, { id: "first", keywords: {} }, fresh)).toEqual(
    {},
  );
});

it("stays bounded when reads never answer: past the cap every read already begun keeps local keywords", () => {
  const ledger = createMailKeywordLedger();
  const hung: number[] = [];
  for (let index = 0; index < MAX_MAIL_KEYWORD_LEDGER_READS; index += 1)
    hung.push(beginMailKeywordRead(ledger));
  beginMailKeywordEdits(ledger, [star("m1")])(true);
  expect(ledger.edits.has("m1")).toBe(true);

  const fresh = beginMailKeywordRead(ledger);
  expect(ledger.reads).toEqual([fresh]);
  expect(ledger.edits.size).toBe(0);

  const local = { id: "m1", keywords: { $flagged: true } };
  for (const startedAt of hung)
    expect(
      merged(ledger, local, { id: "m1", keywords: {} }, startedAt),
    ).toEqual({
      $flagged: true,
    });
  expect(merged(ledger, local, { id: "m1", keywords: {} }, fresh)).toEqual({});

  for (const startedAt of hung) endMailKeywordRead(ledger, startedAt);
  expect(ledger.reads).toEqual([fresh]);
  endMailKeywordRead(ledger, fresh);
  expect(ledger.reads).toEqual([]);
});

it("bounds distinct keywords on one message and still waits for retired writes", () => {
  const ledger = createMailKeywordLedger();
  const finish: Array<(succeeded: boolean) => void> = [];
  for (let index = 0; index <= MAX_MAIL_KEYWORD_LEDGER_EDITS; index += 1)
    finish.push(beginMailKeywordEdits(ledger, [{
      messageId: "one-message",
      keyword: `label-${index}`,
      enabled: true,
    }]));
  const count = [...ledger.edits.values()].reduce((total, keys) => total + keys.size, 0);
  expect(count).toBeLessThanOrEqual(MAX_MAIL_KEYWORD_LEDGER_EDITS);
  expect(ledger.editCount).toBe(count);
  const stale = beginMailKeywordRead(ledger);
  expect(planMailKeywordMerge(ledger, ["one-message"], stale).keepLocal).toBe(true);
  for (const settle of finish) settle(true);
  const fresh = beginMailKeywordRead(ledger);
  expect(planMailKeywordMerge(ledger, ["one-message"], fresh).keepLocal).toBe(false);
  endMailKeywordRead(ledger, stale);
  endMailKeywordRead(ledger, fresh);
  expect(ledger.edits.size).toBe(0);
  expect(ledger.pendingAfterOverflow).toBe(0);
  expect(ledger.editCount).toBe(0);
});

it.each(["reads", "messages"])(
  "keeps new reads conservative while writes retired by a %s overflow are pending",
  (cap) => {
    const ledger = createMailKeywordLedger();
    const finish = beginMailKeywordEdits(ledger, [seen("first", false)]);
    if (cap === "reads") {
      for (let index = 0; index <= MAX_MAIL_KEYWORD_LEDGER_READS; index += 1)
        beginMailKeywordRead(ledger);
    } else {
      beginMailKeywordRead(ledger);
      for (let index = 0; index < MAX_MAIL_KEYWORD_LEDGER_MESSAGES; index += 1)
        beginMailKeywordEdits(ledger, [star(`other-${index}`)])(true);
    }
    expect(ledger.edits.has("first")).toBe(false);
    const read = beginMailKeywordRead(ledger);
    expect(hasPendingMailKeywordEdit(ledger, "first")).toBe(true);
    expect(
      merged(
        ledger,
        { id: "first", keywords: {} },
        { id: "first", keywords: { $seen: true } },
        read,
      ),
    ).toEqual({});
    finish(true);
    expect(hasPendingMailKeywordEdit(ledger, "first")).toBe(false);
    const fresh = beginMailKeywordRead(ledger);
    expect(
      merged(
        ledger,
        { id: "first", keywords: {} },
        { id: "first", keywords: { $seen: true } },
        fresh,
      ),
    ).toEqual({ $seen: true });
  },
);

it("waits for overlapping retired writes across repeated collapses", () => {
  const ledger = createMailKeywordLedger();
  const first = beginMailKeywordEdits(ledger, [star("row")]);
  const second = beginMailKeywordEdits(ledger, [star("row", false)]);
  for (let index = 0; index < 2 * MAX_MAIL_KEYWORD_LEDGER_READS + 3; index += 1)
    beginMailKeywordRead(ledger);
  first(true);
  expect(hasPendingMailKeywordEdit(ledger, "row")).toBe(true);
  const read = beginMailKeywordRead(ledger);
  expect(planMailKeywordMerge(ledger, ["row"], read).keepLocal).toBe(true);
  second(false);
  expect(hasPendingMailKeywordEdit(ledger, "row")).toBe(false);
  const fresh = beginMailKeywordRead(ledger);
  expect(planMailKeywordMerge(ledger, ["row"], fresh).keepLocal).toBe(false);
});

it("compares keywords by what is enabled", () => {
  expect(
    mailKeywordsDiffer(
      { id: "m1", keywords: { $seen: true, $flagged: false } },
      { id: "m1", keywords: { $seen: true } },
    ),
  ).toBe(false);
  expect(mailKeywordsDiffer({ id: "m1" }, { id: "m1", keywords: {} })).toBe(
    false,
  );
  expect(
    mailKeywordsDiffer({ id: "m1", keywords: { $seen: true } }, { id: "m1" }),
  ).toBe(true);
});
