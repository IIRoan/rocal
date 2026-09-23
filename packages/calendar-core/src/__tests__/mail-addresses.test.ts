import { describe, expect, it } from "@jest/globals";

import {
  canSendCompose,
  normalizeEmailAddress,
  parseAddressList,
  parseRecipientString,
  resolveEncryptionInternalDomain,
  resolveReplyAllRecipients,
  resolveReplyRecipients,
  shouldEncryptOutgoingMail,
  validateComposeRecipients,
  isAutomatedMailAddress,
  isReservedSystemEmail,
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

  it("only allows sending complete messages", () => {
    const ready = {
      to: "user2@solace.onl",
      subject: "Hello",
      bodyText: "Hi there",
      attachmentCount: 0,
    };

    expect(canSendCompose(ready)).toBe(true);
    expect(canSendCompose({ ...ready, to: "" })).toBe(false);
    expect(canSendCompose({ ...ready, to: "user2@solace" })).toBe(false);
    expect(canSendCompose({ ...ready, to: "user2@solace.onl, jo" })).toBe(
      false,
    );
    expect(canSendCompose({ ...ready, cc: "nope" })).toBe(false);
    expect(canSendCompose({ ...ready, subject: "  " })).toBe(false);
    expect(canSendCompose({ ...ready, bodyText: " \n " })).toBe(false);
    expect(
      canSendCompose({ ...ready, bodyText: "", attachmentCount: 1 }),
    ).toBe(true);
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
    expect(isAutomatedMailAddress("admin@solace.onl")).toBe(true);
    expect(isAutomatedMailAddress("alice@example.com")).toBe(false);
  });

  it("detects reserved system email addresses that must never be invited or used by users", () => {
    expect(isReservedSystemEmail("admin@solace.onl")).toBe(true);
    expect(isReservedSystemEmail("ADMIN@SOLACE.ONL")).toBe(true);
    expect(isReservedSystemEmail("admin+tag@solace.onl")).toBe(true);
    expect(isReservedSystemEmail("alert@solace.onl")).toBe(true);
    expect(isReservedSystemEmail("alerts@solace.onl")).toBe(true);
    expect(isReservedSystemEmail("noreply@solace.onl")).toBe(true);
    expect(isReservedSystemEmail("root@solace.onl")).toBe(true);
    expect(isReservedSystemEmail("postmaster@solace.onl")).toBe(true);
    expect(isReservedSystemEmail("security@solace.onl")).toBe(true);
    expect(isReservedSystemEmail("administrator@solace.onl")).toBe(true);
    expect(isReservedSystemEmail("admin@customdomain.com", "customdomain.com")).toBe(true);
    expect(isReservedSystemEmail("alert@customdomain.com", "customdomain.com")).toBe(true);
    expect(isReservedSystemEmail("admin@randomcorp.com")).toBe(true);
    expect(isReservedSystemEmail("root@external.org")).toBe(true);
    expect(isReservedSystemEmail("postmaster@external.org")).toBe(true);

    // Normal user addresses are allowed
    expect(isReservedSystemEmail("testingproduction15@solace.onl")).toBe(false);
    expect(isReservedSystemEmail("alice@example.com")).toBe(false);
    expect(isReservedSystemEmail("user@solace.onl")).toBe(false);
    expect(isReservedSystemEmail("john.doe@solace.onl")).toBe(false);
  });
});
