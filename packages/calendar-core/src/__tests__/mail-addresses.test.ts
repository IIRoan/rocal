import { describe, expect, it } from "@jest/globals";

import {
  normalizeEmailAddress,
  parseAddressList,
  parseRecipientString,
  resolveReplyRecipients,
  validateComposeRecipients,
} from "../mail-addresses";

describe("mail address parsing", () => {
  it("parses bare email addresses", () => {
    expect(parseRecipientString("user2@solace.onl")).toEqual({
      email: "user2@solace.onl",
    });
  });

  it("parses display-name addresses", () => {
    expect(parseRecipientString("User Two <user2@solace.onl>")).toEqual({
      name: "User Two",
      email: "user2@solace.onl",
    });
  });

  it("deduplicates parsed address lists", () => {
    expect(
      parseAddressList("user2@solace.onl, User Two <user2@solace.onl>"),
    ).toEqual([{ email: "user2@solace.onl" }]);
  });

  it("normalizes email casing", () => {
    expect(normalizeEmailAddress("  Alice@Solace.Onl ")).toBe(
      "alice@solace.onl",
    );
  });

  it("rejects invalid recipient tokens during compose validation", () => {
    const result = validateComposeRecipients({
      to: "not-an-email",
      subject: "Hello",
    });

    expect(result.errors.recipients).toMatch(/Invalid email address/);
  });

  it("accepts valid multi-recipient compose input", () => {
    const result = validateComposeRecipients({
      to: "user2@solace.onl, Friend <friend@example.com>",
      cc: "cc@solace.onl",
      subject: "Hello",
    });

    expect(result.errors).toEqual({});
    expect(result.to).toEqual([
      { email: "user2@solace.onl" },
      { name: "Friend", email: "friend@example.com" },
    ]);
    expect(result.cc).toEqual([{ email: "cc@solace.onl" }]);
  });

  it("prefers sender for standard replies", () => {
    expect(
      resolveReplyRecipients({
        from: [{ email: "alice@solace.onl" }],
        to: [{ email: "me@solace.onl" }],
        cc: [{ email: "other@solace.onl" }],
        currentUserEmail: "me@solace.onl",
      }),
    ).toEqual(["alice@solace.onl"]);
  });

  it("falls back to non-self recipients when replying to own last message", () => {
    expect(
      resolveReplyRecipients({
        from: [{ email: "me@solace.onl" }],
        to: [{ email: "alice@solace.onl" }],
        cc: [{ email: "bob@solace.onl" }],
        currentUserEmail: "me@solace.onl",
      }),
    ).toEqual(["alice@solace.onl", "bob@solace.onl"]);
  });
});
