import { describe, expect, it } from "@jest/globals";
import {
  beginMailKeywordEdits,
  beginMailKeywordRead,
  createMailKeywordLedger,
  planMailKeywordMerge,
} from "@workspace/calendar-core";
import {
  mergeRefreshedIntoCurrentMessages,
  mergeRefreshedMailboxMessages,
} from "@/lib/mail/mail-list-merge";
import type { JmapEmailMessage } from "@/lib/mail/types";

function message(
  id: string,
  receivedAt: string,
): JmapEmailMessage {
  return {
    id,
    receivedAt,
    keywords: {},
    mailboxIds: {},
  };
}

describe("mergeRefreshedMailboxMessages", () => {
  it("returns sorted refreshed page when the current list is empty", () => {
    const refreshed = [
      message("b", "2026-06-13T10:00:00.000Z"),
      message("a", "2026-06-13T09:00:00.000Z"),
    ];

    expect(
      mergeRefreshedMailboxMessages([], refreshed, 0, refreshed.length),
    ).toEqual([
      message("b", "2026-06-13T10:00:00.000Z"),
      message("a", "2026-06-13T09:00:00.000Z"),
    ]);
  });

  it("keeps tail pages while replacing the refreshed head", () => {
    const current = [
      message("1", "2026-06-13T12:00:00.000Z"),
      message("2", "2026-06-13T11:00:00.000Z"),
      message("3", "2026-06-13T10:00:00.000Z"),
      message("4", "2026-06-13T09:00:00.000Z"),
    ];
    const refreshed = [
      message("new", "2026-06-13T12:30:00.000Z"),
      message("2", "2026-06-13T11:00:00.000Z"),
    ];

    const merged = mergeRefreshedMailboxMessages(
      current,
      refreshed,
      4,
      5,
    );

    expect(merged.map((entry) => entry.id)).toEqual(["new", "2", "3", "4"]);
  });

  it("does not duplicate ids already present in the refreshed page", () => {
    const current = [
      message("1", "2026-06-13T12:00:00.000Z"),
      message("2", "2026-06-13T11:00:00.000Z"),
    ];
    const refreshed = [
      message("1", "2026-06-13T12:05:00.000Z"),
      message("fresh", "2026-06-13T12:10:00.000Z"),
    ];

    const merged = mergeRefreshedMailboxMessages(
      current,
      refreshed,
      2,
      2,
    );

    expect(merged.map((entry) => entry.id)).toEqual(["fresh", "1"]);
    expect(merged.find((entry) => entry.id === "1")?.receivedAt).toBe(
      "2026-06-13T12:05:00.000Z",
    );
  });
});

describe("mergeRefreshedIntoCurrentMessages", () => {
  const first = message("1", "2026-06-13T12:00:00.000Z");
  const second = message("2", "2026-06-13T11:00:00.000Z");
  const third = message("3", "2026-06-13T10:00:00.000Z");
  const ids = (messages: JmapEmailMessage[]) => messages.map((entry) => entry.id);

  it("matches the plain merge when nothing changed while the page was in flight", () => {
    const started = [first, second, third];
    const refreshed = [message("new", "2026-06-13T12:30:00.000Z"), first];
    expect(
      mergeRefreshedIntoCurrentMessages({
        started,
        current: started,
        refreshed,
        previousTotal: 3,
        newTotal: 4,
      }),
    ).toEqual(mergeRefreshedMailboxMessages(started, refreshed, 3, 4));
  });

  it("does not bring back a row that was moved or deleted here after the request began", () => {
    const merged = mergeRefreshedIntoCurrentMessages({
      started: [first, second, third],
      current: [first, third],
      refreshed: [first, second, third],
      previousTotal: 3,
      newTotal: 3,
    });
    expect(ids(merged)).toEqual(["1", "3"]);
  });

  it("keeps a row that arrived here while the page was in flight", () => {
    const arrived = message("arrived", "2026-06-13T13:00:00.000Z");
    const merged = mergeRefreshedIntoCurrentMessages({
      started: [first, second],
      current: [arrived, first, second],
      refreshed: [first, second],
      previousTotal: 2,
      newTotal: 2,
    });
    expect(ids(merged)).toEqual(["arrived", "1", "2"]);
  });

  it("still adds a row the server lists that was never shown here", () => {
    const fresh = message("fresh", "2026-06-13T12:30:00.000Z");
    const merged = mergeRefreshedIntoCurrentMessages({
      started: [first, second],
      current: [first, second],
      refreshed: [fresh, first, second],
      previousTotal: 2,
      newTotal: 3,
    });
    expect(ids(merged)).toEqual(["fresh", "1", "2"]);
  });

  it("keeps a keyword edited after the page was requested and takes the rest from the page", () => {
    const ledger = createMailKeywordLedger();
    const startedAt = beginMailKeywordRead(ledger);
    beginMailKeywordEdits(ledger, [
      { messageId: "1", keyword: "$flagged", enabled: true },
    ])(true);
    const current = [{ ...first, keywords: { $flagged: true } }, second];
    const refreshed = [
      { ...first, keywords: { $seen: true } },
      { ...second, keywords: { $seen: true } },
    ];
    const merged = mergeRefreshedIntoCurrentMessages({
      started: [first, second],
      current,
      refreshed,
      previousTotal: 2,
      newTotal: 2,
      keywordGuard: planMailKeywordMerge(ledger, ["1", "2"], startedAt),
    });
    expect(merged.map((entry) => entry.keywords)).toEqual([
      { $seen: true, $flagged: true },
      { $seen: true },
    ]);
  });
});
