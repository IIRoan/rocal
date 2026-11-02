import { describe, expect, it } from "@jest/globals";

import {
  formatMailThreadDateRange,
  getMailThreadParticipants,
  planMailThreadStack,
  type MailThreadStackEntry,
} from "./mail-thread-summary";

const ids = (entries: MailThreadStackEntry<{ id: string }>[]) =>
  entries.map((entry) =>
    entry.kind === "folded"
      ? `+${entry.count}`
      : entry.expanded
        ? `[${entry.message.id}]`
        : entry.message.id,
  );

describe("planMailThreadStack", () => {
  const thread = ["a", "b", "c", "d", "e", "f", "g"].map((id) => ({ id }));

  it("expands the newest message when none is open and folds the long run before it", () => {
    expect(ids(planMailThreadStack(thread, null, false))).toEqual([
      "a",
      "+4",
      "f",
      "[g]",
    ]);
  });

  it("folds both sides of an open middle message", () => {
    const long = [...thread, { id: "h" }, { id: "i" }];
    expect(ids(planMailThreadStack(long, "e", false))).toEqual([
      "a",
      "+2",
      "d",
      "[e]",
      "f",
      "+2",
      "i",
    ]);
  });

  it("keeps short runs and shows everything when asked", () => {
    expect(ids(planMailThreadStack(thread.slice(0, 4), "d", false))).toEqual([
      "a",
      "b",
      "c",
      "[d]",
    ]);
    expect(planMailThreadStack(thread, "g", true)).toHaveLength(7);
  });

  it("returns nothing for an empty thread", () => {
    expect(planMailThreadStack([], "a", false)).toEqual([]);
  });
});

describe("getMailThreadParticipants", () => {
  it("dedupes case-insensitively, fills a missing name and puts the account last", () => {
    const participants = getMailThreadParticipants(
      [
        {
          id: "1",
          from: [{ email: "me@solace.onl", name: "Me" }],
          to: [{ email: "Ali@example.com" }],
        },
        {
          id: "2",
          from: [{ email: "ali@example.com", name: "Ali" }],
          to: [{ email: "me@solace.onl" }],
          cc: [{ email: "sarah@example.com", name: " Sarah " }, { email: "" }],
        },
      ],
      "ME@solace.onl",
    );
    expect(participants).toEqual([
      { email: "Ali@example.com", name: "Ali", isSelf: false },
      { email: "sarah@example.com", name: "Sarah", isSelf: false },
      { email: "me@solace.onl", name: "Me", isSelf: true },
    ]);
  });
});

describe("formatMailThreadDateRange", () => {
  const now = new Date("2026-11-02T12:00:00Z");

  it("spans the first and last message in the user's time zone", () => {
    expect(
      formatMailThreadDateRange(
        [
          { id: "1", receivedAt: "2026-03-29T09:00:00Z" },
          { id: "2", receivedAt: "2026-03-24T23:30:00Z" },
        ],
        "Europe/Amsterdam",
        now,
      ),
    ).toBe("Mar 25 – Mar 29");
  });

  it("shows one day, adds the year outside the current one and skips bad dates", () => {
    expect(
      formatMailThreadDateRange(
        [
          { id: "1", receivedAt: "2025-12-31T08:00:00Z" },
          { id: "2", receivedAt: "2025-12-31T18:00:00Z" },
          { id: "3", receivedAt: "not a date" },
        ],
        "UTC",
        now,
      ),
    ).toBe("Dec 31, 2025");
    expect(formatMailThreadDateRange([{ id: "1" }], "UTC", now)).toBeNull();
  });
});
