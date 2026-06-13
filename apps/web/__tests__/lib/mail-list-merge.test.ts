import { describe, expect, it } from "@jest/globals";
import { mergeRefreshedMailboxMessages } from "@/lib/mail/mail-list-merge";
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
