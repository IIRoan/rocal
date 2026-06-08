import { describe, expect, it } from "@jest/globals";

import {
  MAILBOX_QUERY_PARAM,
  MESSAGE_QUERY_PARAM,
  buildMailSearchParams,
  buildMailUrl,
  buildMailUrlFromIds,
  decodeMailMessageToken,
  encodeMailMessageToken,
  encodeMailboxSegment,
  locationsEqual,
  normalizeMailLocation,
  parseMailLocation,
  parseMailSearchParams,
  resolveMailboxFromSegment,
  shouldClearMessageSelection,
} from "../../lib/mail/mail-url";
import type { JmapMailbox } from "../../lib/mail/types";

function mailbox(
  overrides: Partial<JmapMailbox> & Pick<JmapMailbox, "id">,
): JmapMailbox {
  return {
    name: overrides.name ?? "Mailbox",
    ...overrides,
  };
}

describe("mail message tokens", () => {
  it("encodes and decodes message ids with RFC Message-ID headers", () => {
    const token = encodeMailMessageToken("diaaaaa7", [
      "<CABc8xK-long-message-id-value@mail.example.com>",
    ]);

    expect(token.length).toBeGreaterThan("diaaaaa7".length);
    expect(decodeMailMessageToken(token)).toBe("diaaaaa7");
  });

  it("round-trips ids without headers", () => {
    const token = encodeMailMessageToken("message-1");
    expect(decodeMailMessageToken(token)).toBe("message-1");
  });

  it("decodes legacy raw tokens", () => {
    expect(decodeMailMessageToken("diaaaaa7")).toBe("diaaaaa7");
    expect(decodeMailMessageToken(encodeURIComponent("msg/with/slash"))).toBe(
      "msg/with/slash",
    );
  });
});

describe("mailbox segments", () => {
  it("encodes known mailbox roles and custom mailbox ids", () => {
    expect(encodeMailboxSegment(mailbox({ id: "mb-inbox", role: "inbox" }))).toBe(
      "inbox",
    );
    expect(
      encodeMailboxSegment(mailbox({ id: "custom/folder", role: null })),
    ).toBe(encodeURIComponent("custom/folder"));
  });

  it("resolves mailbox segments by role or id", () => {
    const mailboxes = [
      mailbox({ id: "mb-inbox", role: "inbox", name: "Inbox" }),
      mailbox({ id: "custom-folder", role: null, name: "Projects" }),
    ];

    expect(resolveMailboxFromSegment("inbox", mailboxes)?.id).toBe("mb-inbox");
    expect(resolveMailboxFromSegment("custom-folder", mailboxes)?.id).toBe(
      "custom-folder",
    );
  });
});

describe("parseMailSearchParams", () => {
  it("reads mailbox and message query params", () => {
    const token = encodeMailMessageToken("message-1");

    expect(parseMailSearchParams("")).toEqual({
      mailboxSegment: null,
      messageId: null,
    });
    expect(parseMailSearchParams(`mbox=inbox&msg=${token}`)).toEqual({
      mailboxSegment: "inbox",
      messageId: "message-1",
    });
  });

  it("supports the legacy messageId query param", () => {
    expect(parseMailSearchParams("messageId=legacy-1")).toEqual({
      mailboxSegment: null,
      messageId: "legacy-1",
    });
  });
});

describe("parseMailLocation", () => {
  it("prefers query params over legacy path segments", () => {
    const token = encodeMailMessageToken("from-query");

    expect(
      parseMailLocation("/mail/inbox/old-token", `mbox=sent&msg=${token}`),
    ).toEqual({
      mailboxSegment: "sent",
      messageId: "from-query",
    });
  });

  it("falls back to legacy path segments when query params are absent", () => {
    const token = encodeMailMessageToken("from-path");

    expect(parseMailLocation("/mail/inbox", "")).toEqual({
      mailboxSegment: "inbox",
      messageId: null,
    });
    expect(parseMailLocation(`/mail/inbox/${token}`, "")).toEqual({
      mailboxSegment: "inbox",
      messageId: "from-path",
    });
    expect(parseMailLocation("/mail/inbox/diaaaaa7", "")).toEqual({
      mailboxSegment: "inbox",
      messageId: "diaaaaa7",
    });
  });
});

describe("buildMailUrl", () => {
  it("builds query-param urls for mailbox and message selection", () => {
    const inbox = mailbox({ id: "mb-inbox", role: "inbox" });
    const token = encodeMailMessageToken("message-1", [
      "<long-header@example.com>",
    ]);

    expect(buildMailUrl()).toBe("/mail");
    expect(buildMailUrl({ mailbox: inbox })).toBe("/mail?mbox=inbox");
    expect(
      buildMailUrl({
        mailbox: inbox,
        messageId: "message-1",
        messageHeaderIds: ["<long-header@example.com>"],
      }),
    ).toBe(`/mail?mbox=inbox&msg=${token}`);
  });

  it("builds urls from mailbox ids when mailbox objects are unavailable", () => {
    const token = encodeMailMessageToken("message-2");

    expect(buildMailUrlFromIds("mb-sent", "message-2")).toBe(
      `/mail?mbox=mb-sent&msg=${token}`,
    );
    expect(buildMailUrlFromIds(undefined, "message-2")).toBe(
      `/mail?msg=${token}`,
    );
  });

  it("builds search params without pathname", () => {
    const params = buildMailSearchParams({
      mailboxSegment: "inbox",
      messageId: "message-1",
    });

    expect(params.get(MAILBOX_QUERY_PARAM)).toBe("inbox");
    expect(decodeMailMessageToken(params.get(MESSAGE_QUERY_PARAM) ?? "")).toBe(
      "message-1",
    );
  });
});

describe("normalizeMailLocation", () => {
  it("migrates legacy path urls to query params", () => {
    const token = encodeMailMessageToken("message-1");

    expect(normalizeMailLocation("/mail/inbox", "")).toBe("/mail?mbox=inbox");
    expect(normalizeMailLocation(`/mail/inbox/${token}`, "")).toBe(
      `/mail?mbox=inbox&msg=${token}`,
    );
  });

  it("migrates legacy messageId query params to msg tokens", () => {
    const normalized = normalizeMailLocation("/mail", "messageId=legacy-1");

    expect(normalized).toBe(
      `/mail?msg=${encodeMailMessageToken("legacy-1")}`,
    );
  });

  it("returns /mail when nothing is selected", () => {
    expect(normalizeMailLocation("/mail", "")).toBe("/mail");
  });

  it("preserves already-normalized query urls", () => {
    const token = encodeMailMessageToken("message-1", [
      "<long-header@example.com>",
    ]);

    expect(normalizeMailLocation("/mail", `mbox=inbox&msg=${token}`)).toBe(
      `/mail?mbox=inbox&msg=${token}`,
    );
  });
});

describe("locationsEqual", () => {
  it("compares mailbox and message query params only", () => {
    const token = encodeMailMessageToken("message-1");

    expect(
      locationsEqual("/mail?mbox=inbox&msg=abc", "/mail?mbox=inbox&msg=abc"),
    ).toBe(true);
    expect(
      locationsEqual(
        `/mail?mbox=inbox&msg=${token}`,
        `/mail?mbox=inbox&msg=${token}&foo=bar`,
      ),
    ).toBe(true);
    expect(
      locationsEqual("/mail?mbox=inbox", "/mail?mbox=sent"),
    ).toBe(false);
  });

  it("treats message tokens with the same id as equal", () => {
    const withHeader = encodeMailMessageToken("message-1", [
      "<long-header@example.com>",
    ]);
    const withoutHeader = encodeMailMessageToken("message-1");

    expect(
      locationsEqual(
        `/mail?mbox=inbox&msg=${withHeader}`,
        `/mail?mbox=inbox&msg=${withoutHeader}`,
      ),
    ).toBe(true);
  });
});

describe("shouldClearMessageSelection", () => {
  it("clears selection when the route has a mailbox but no message", () => {
    expect(
      shouldClearMessageSelection(
        { mailboxSegment: "inbox", messageId: null },
        "message-1",
      ),
    ).toBe(true);
    expect(
      shouldClearMessageSelection(
        { mailboxSegment: "inbox", messageId: "message-1" },
        "message-1",
      ),
    ).toBe(false);
    expect(
      shouldClearMessageSelection(
        { mailboxSegment: null, messageId: null },
        "message-1",
      ),
    ).toBe(false);
  });
});
