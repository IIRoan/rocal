import { describe, expect, it } from "@jest/globals";

import {
  normalizeEmailAddress,
  parseAddressList,
  parseRecipientString,
  resolveEncryptionInternalDomain,
  resolveReplyAllRecipients,
  resolveReplyRecipients,
  shouldEncryptOutgoingMail,
  validateComposeRecipients,
  isAutomatedMailAddress,
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

  it("encrypts only when every recipient is on the configured domain", () => {
    const domain = resolveEncryptionInternalDomain("solace.onl");
    expect(
      shouldEncryptOutgoingMail(["alice@solace.onl"], domain),
    ).toBe(true);
    expect(
      shouldEncryptOutgoingMail(["friend@gmail.com"], domain),
    ).toBe(false);
    expect(
      shouldEncryptOutgoingMail(
        ["alice@solace.onl", "friend@gmail.com"],
        domain,
      ),
    ).toBe(false);
    expect(shouldEncryptOutgoingMail(["alice@solace.onl"], null)).toBe(false);
    expect(shouldEncryptOutgoingMail([], domain)).toBe(false);
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

  it("puts the sender in To and remaining recipients in Cc for reply-all", () => {
    expect(
      resolveReplyAllRecipients({
        from: [{ email: "alice@solace.onl" }],
        to: [{ email: "me@solace.onl" }, { email: "bob@solace.onl" }],
        cc: [{ email: "cara@solace.onl" }],
        currentUserEmail: "me@solace.onl",
      }),
    ).toEqual({
      to: ["alice@solace.onl"],
      cc: ["bob@solace.onl", "cara@solace.onl"],
    });
  });

  it("uses original To/Cc when reply-all is used on a message you sent", () => {
    expect(
      resolveReplyAllRecipients({
        from: [{ email: "me@solace.onl" }],
        to: [{ email: "alice@solace.onl" }],
        cc: [{ email: "bob@solace.onl" }],
        currentUserEmail: "me@solace.onl",
      }),
    ).toEqual({
      to: ["alice@solace.onl"],
      cc: ["bob@solace.onl"],
    });
  });

  it("detects automated noreply and bounce addresses", () => {
    expect(isAutomatedMailAddress("noreply@solace.onl")).toBe(true);
    expect(isAutomatedMailAddress("no-reply@example.com")).toBe(true);
    expect(isAutomatedMailAddress("mailer-daemon@example.com")).toBe(true);
    expect(isAutomatedMailAddress("alice@example.com")).toBe(false);
  });
});
