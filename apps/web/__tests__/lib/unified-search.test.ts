import { describe, expect, it } from "@jest/globals";
import {
  normalizeSearchText,
  searchMailMessages,
  tokenizeSearchQuery,
} from "../../lib/search/unified-search";
import type { JmapEmailMessage } from "../../lib/mail/types";

const messages: JmapEmailMessage[] = [
  {
    id: "mail-1",
    subject: "Planning notes",
    from: [{ name: "Alice", email: "alice@example.com" }],
    to: [{ email: "roan@example.com" }],
    receivedAt: "2026-05-27T10:00:00.000Z",
    bodyValues: {
      text: { value: "Calendar launch checklist and private search details" },
    },
    textBody: [{ partId: "text" }],
    keywords: { $seen: false },
  },
  {
    id: "mail-2",
    subject: "Invoice",
    from: [{ name: "Billing", email: "billing@example.com" }],
    receivedAt: "2026-05-20T10:00:00.000Z",
    bodyValues: {
      text: { value: "Monthly receipt" },
    },
    textBody: [{ partId: "text" }],
  },
  {
    id: "mail-3",
    subject: "Encrypted",
    from: [{ email: "secure@example.com" }],
    bodyValues: {
      text: { value: "-----BEGIN PGP MESSAGE-----\nabc" },
    },
    textBody: [{ partId: "text" }],
  },
];

describe("unified search helpers", () => {
  it("normalizes and tokenizes query text", () => {
    expect(normalizeSearchText("  Café   Search!! ")).toBe("café search");
    expect(tokenizeSearchQuery("Search search mail")).toEqual([
      "search",
      "mail",
    ]);
  });

  it("searches mail bodies without sending the query to a server", () => {
    const results = searchMailMessages(messages, "private search", 10);

    expect(results).toHaveLength(1);
    expect(results[0]?.source).toBe("mail");
    expect(results[0]?.source === "mail" ? results[0].messageId : null).toBe(
      "mail-1",
    );
    expect(results[0]?.matchedFields).toContain("body");
    expect(results[0]?.snippet).toContain("private search");
  });

  it("marks PGP messages as metadata-only when only encrypted body text is available", () => {
    const results = searchMailMessages(messages, "encrypted", 10);

    expect(results[0]?.source === "mail" ? results[0].messageId : null).toBe(
      "mail-3",
    );
    expect(results[0]?.encryptionStatus).toBe("metadata-only");
  });
});
