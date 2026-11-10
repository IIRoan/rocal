import {
  collectPrivateMailTitles,
  parsePrivateSearchCoverage,
  privateSearchCoverageText,
  unknownPrivateSearchCoverage,
  withPrivateSearchBodyCoverage,
} from "../private-search-coverage";

function collect(total: number, mailboxIds = ["inbox"]) {
  return collectPrivateMailTitles({
    mailboxIds,
    loadPage: async (id, position, limit) => ({
      total,
      messages: Array.from(
        { length: Math.min(limit, Math.max(0, total - position)) },
        (_, index) => ({ id: `${id}:${position + index}`, subject: "Fixture" }),
      ),
    }),
  });
}

describe("private search coverage", () => {
  it("treats missing, newer and malformed metadata as unknown", () => {
    for (const value of [
      undefined,
      null,
      { version: 2 },
      { ...unknownPrivateSearchCoverage(), extra: true },
      { version: 1, titles: { state: "complete", indexedMessages: -1 } },
    ]) {
      expect(parsePrivateSearchCoverage(value).titles.state).toBe("unknown");
    }
  });
  it("distinguishes an exhausted exact boundary from omitted history", async () => {
    expect((await collect(800)).coverage.titles.state).toBe("complete");
    expect((await collect(801)).coverage.titles.reasons).toContain(
      "mailbox_message_limit",
    );
    expect(
      (
        await collect(
          1,
          Array.from({ length: 13 }, (_, index) => String(index)),
        )
      ).coverage.titles.reasons,
    ).toContain("mailbox_limit");
    const global = await collect(
      800,
      Array.from({ length: 12 }, (_, index) => String(index)),
    );
    expect(global.documents).toHaveLength(6000);
    expect(global.coverage.titles.reasons).toContain("message_limit");
  });
  it("counts unique messages rather than adding folder totals", async () => {
    const result = await collectPrivateMailTitles({
      mailboxIds: ["inbox", "archive"],
      loadPage: async () => ({ total: 1, messages: [{ id: "same" }] }),
    });
    expect(result.coverage.titles.indexedMessages).toBe(1);
    expect(result.coverage.titles.examinedMailboxes).toBe(2);
  });
  it("keeps observed documents and reports a failed page as partial", async () => {
    const result = await collectPrivateMailTitles({
      mailboxIds: ["inbox", "unavailable"],
      loadPage: async (id) => {
        if (id === "unavailable") throw new Error("offline");
        return { total: 1, messages: [{ id: "m1" }] };
      },
    });
    expect(result.documents).toHaveLength(1);
    expect(result.coverage.titles.reasons).toEqual(["fetch_failure"]);
  });
  it("reports excerpt limits even after body backfill has completed", async () => {
    const result = await collect(2);
    const coverage = withPrivateSearchBodyCoverage(
      result.coverage,
      result.documents.map((document) => ({ ...document, body: "excerpt" })),
    );
    expect(parsePrivateSearchCoverage(coverage)).toEqual(coverage);
    expect(coverage.bodies.pendingMessages).toBe(0);
    expect(privateSearchCoverageText(coverage)).toContain(
      "5000 characters each",
    );
  });
});
