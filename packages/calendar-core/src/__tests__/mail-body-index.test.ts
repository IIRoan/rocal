import { describe, expect, it, jest } from "@jest/globals";
import {
  MAIL_BODY_EXCERPT_MAX_CHARS,
  buildMailBodyExcerpt,
  mailBodySnippet,
  refreshMailBodyExcerpts,
} from "../mail-body-index";
import {
  mailToTitleIndexDocument,
  searchTitleIndex,
  type TitleIndexDocument,
} from "../title-search-index";

const doc = (
  id: string,
  receivedAt: string,
  body?: string,
): TitleIndexDocument => ({
  ...mailToTitleIndexDocument({ id, subject: `Subject ${id}`, receivedAt }),
  ...(body === undefined ? {} : { body }),
});

describe("buildMailBodyExcerpt", () => {
  it("prefers text, collapses whitespace and truncates", () => {
    expect(
      buildMailBodyExcerpt({ text: " Hello \n\n  world ", html: "<p>x</p>" }),
    ).toBe("Hello world");
    expect(buildMailBodyExcerpt({ text: "a".repeat(5000) })).toHaveLength(
      MAIL_BODY_EXCERPT_MAX_CHARS,
    );
  });

  it("strips html, styles and entities when there is no text", () => {
    expect(
      buildMailBodyExcerpt({
        html: "<style>p{color:red}</style><p>Invoice&nbsp;due &amp; payable</p>",
      }),
    ).toBe("Invoice due & payable");
  });

  it("uses decoded HTML instead of a raw MIME text fallback", () => {
    expect(
      buildMailBodyExcerpt({
        text: "Content-Type: text/html\r\nContent-Transfer-Encoding: base64\r\n\r\nPHA+WmVwcGVsaW4gcGxhbnM8L3A+",
        html: "<p>Zeppelin plans</p>",
      }),
    ).toBe("Zeppelin plans");
  });
});

describe("body search", () => {
  it("finds mail by body text and returns a snippet around the match", () => {
    const hits = searchTitleIndex(
      [
        doc(
          "1",
          "2026-01-01T00:00:00Z",
          "Your flight to Lisbon departs at noon",
        ),
      ],
      "lisbon",
      5,
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]?.matchedFields).toEqual(["body"]);
    expect(hits[0]?.snippet).toContain("Lisbon");
  });

  it("ranks a subject match above a body-only match", () => {
    const hits = searchTitleIndex(
      [
        doc("body", "2026-02-01T00:00:00Z", "invoice attached"),
        { ...doc("title", "2026-01-01T00:00:00Z"), title: "Invoice" },
      ],
      "invoice",
      5,
    );
    expect(hits.map((hit) => hit.document.id)).toEqual([
      "mail:title",
      "mail:body",
    ]);
  });

  it("builds a snippet only when a word occurs", () => {
    expect(mailBodySnippet("nothing here", ["lisbon"])).toBeUndefined();
  });
});

describe("refreshMailBodyExcerpts", () => {
  it("carries over bodies and only loads missing ones, newest first", async () => {
    const loadBodies = jest.fn(
      async (batch: TitleIndexDocument[]) =>
        new Map(batch.map((d) => [d.id, `body of ${d.id}`] as const)),
    );
    const previous = [doc("old", "2026-01-01T00:00:00Z", "kept")];
    const result = await refreshMailBodyExcerpts({
      documents: [
        doc("old", "2026-01-01T00:00:00Z"),
        doc("new", "2026-03-01T00:00:00Z"),
      ],
      previous,
      loadBodies,
      batchSize: 5,
    });

    expect(loadBodies).toHaveBeenCalledTimes(1);
    expect(loadBodies.mock.calls[0]?.[0].map((d) => d.id)).toEqual([
      "mail:new",
    ]);
    expect(result.documents.map((d) => d.body)).toEqual([
      "kept",
      "body of mail:new",
    ]);
    expect(result.pending).toBe(0);
  });

  it("stops without marking anything when nothing could be read", async () => {
    const result = await refreshMailBodyExcerpts({
      documents: [doc("a", "2026-01-01T00:00:00Z")],
      previous: [],
      loadBodies: async () => new Map(),
    });
    expect(result.documents[0]?.body).toBeUndefined();
    expect(result.pending).toBe(1);
    expect(result.loaded).toBe(0);
  });

  it("leaves failed reads pending and retries them on the next pass", async () => {
    const documents = [
      doc("a", "2026-02-01T00:00:00Z"),
      doc("b", "2026-01-01T00:00:00Z"),
    ];
    const result = await refreshMailBodyExcerpts({
      documents,
      previous: [],
      loadBodies: async () => new Map([["mail:a", "text"]]),
    });
    expect(result.documents.map((d) => d.body)).toEqual(["text", undefined]);
    expect(result.pending).toBe(1);
    expect(result.loaded).toBe(1);

    const loadBodies = jest.fn(
      async (batch: TitleIndexDocument[]) =>
        new Map(batch.map((d) => [d.id, "unlocked"])),
    );
    const retried = await refreshMailBodyExcerpts({
      documents,
      previous: result.documents,
      loadBodies,
    });
    expect(loadBodies.mock.calls[0]?.[0].map((d) => d.id)).toEqual(["mail:b"]);
    expect(retried.documents.map((d) => d.body)).toEqual(["text", "unlocked"]);
    expect(retried.pending).toBe(0);
  });

  it("carries over successfully read empty bodies without retrying them", async () => {
    const loadBodies = jest.fn(async () => new Map<string, string>());
    const result = await refreshMailBodyExcerpts({
      documents: [doc("empty", "2026-01-01T00:00:00Z")],
      previous: [doc("empty", "2026-01-01T00:00:00Z", "")],
      loadBodies,
    });
    expect(loadBodies).not.toHaveBeenCalled();
    expect(result.documents[0]?.body).toBe("");
    expect(result.pending).toBe(0);
    expect(result.loaded).toBe(0);
  });

  it("respects the pass limit and drops bodies outside the newest window", async () => {
    const loadBodies = async (batch: TitleIndexDocument[]) =>
      new Map(batch.map((d) => [d.id, "x"] as const));
    const result = await refreshMailBodyExcerpts({
      documents: [
        doc("1", "2026-03-01T00:00:00Z"),
        doc("2", "2026-02-01T00:00:00Z"),
        doc("3", "2026-01-01T00:00:00Z", "stale"),
      ],
      previous: [doc("3", "2026-01-01T00:00:00Z", "stale")],
      loadBodies,
      maxIndexed: 2,
      passLimit: 1,
      batchSize: 1,
    });
    expect(result.documents.map((d) => d.body)).toEqual([
      "x",
      undefined,
      undefined,
    ]);
    expect(result.pending).toBe(1);
  });

  it("counts successful reads toward the pass limit even in partial batches", async () => {
    const loadBodies = jest.fn(
      async (batch: TitleIndexDocument[]) =>
        new Map(batch.filter((d) => d.id !== "mail:1").map((d) => [d.id, "x"])),
    );
    const result = await refreshMailBodyExcerpts({
      documents: ["1", "2", "3", "4"].map((id) =>
        doc(id, `2026-01-0${5 - Number(id)}T00:00:00Z`),
      ),
      previous: [],
      loadBodies,
      passLimit: 2,
      batchSize: 10,
    });
    expect(
      loadBodies.mock.calls.map(([batch]) => batch.map((d) => d.id)),
    ).toEqual([["mail:1", "mail:2"], ["mail:3"]]);
    expect(result.documents.map((d) => d.body)).toEqual([
      undefined,
      "x",
      "x",
      undefined,
    ]);
    expect(result.loaded).toBe(2);
    expect(result.pending).toBe(2);
  });
});
