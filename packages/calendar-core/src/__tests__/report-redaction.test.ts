import { describe, expect, it } from "@jest/globals";
import {
  LOG_HASH_FIELD_KEYS,
  LOG_OMIT_FIELD_KEYS,
  redactPII,
  sanitizeContext,
  sanitizeRequestUrl,
} from "../report-redaction";

const EMAIL = "alice.smith@example.com";
const TOKEN = "eyJhbGciOiJIUzI1NiJ9.secret-payload.signature";
const SECRET_URL = "https://app.solace.onl/reset?token=abc123&email=alice";

describe("report redaction policy", () => {
  it("covers content, secret and identifier keys", () => {
    expect(LOG_OMIT_FIELD_KEYS).toEqual(
      expect.arrayContaining(["title", "subject", "body", "token", "authorization", "cookie"]),
    );
    expect(LOG_HASH_FIELD_KEYS).toEqual(expect.arrayContaining(["email", "name"]));
  });
});

describe("redactPII / sanitizeRequestUrl", () => {
  it("removes emails, bearer tokens and URLs from free text", () => {
    expect(
      redactPII(`Failed for ${EMAIL} with Bearer ${TOKEN} at ${SECRET_URL}`),
    ).toBe("Failed for [email] with Bearer [redacted] at [url]");
  });

  it("strips query strings from absolute and relative URLs", () => {
    expect(sanitizeRequestUrl(SECRET_URL)).toBe(
      "https://app.solace.onl/reset?[redacted]",
    );
    expect(sanitizeRequestUrl("/mail?q=alice")).toBe("/mail?[redacted]");
  });

  it("redacts email path params in URLs, including percent-encoded forms", () => {
    expect(
      sanitizeRequestUrl(
        "http://cloudflared.roan.dev/api/mail/keys/testingproduction16%40solace.onl",
      ),
    ).toBe("http://cloudflared.roan.dev/api/mail/keys/[email]");
    expect(
      sanitizeRequestUrl("https://api.solace.onl/api/mail/keys/bob@solace.onl"),
    ).toBe("https://api.solace.onl/api/mail/keys/[email]");
  });

  it("redacts percent-encoded emails from free text", () => {
    expect(redactPII("key lookup failed for bob%40solace.onl")).toBe(
      "key lookup failed for [email]",
    );
  });
});

describe("sanitizeContext", () => {
  it("omits sensitive keys case-insensitively and hashes or drops identifiers", () => {
    const context = {
      title: "Dentist appointment",
      Subject: "Quarterly salary",
      body: "hello",
      token: TOKEN,
      email: EMAIL,
      eventId: "evt_1",
      nested: { authorization: `Bearer ${TOKEN}`, note: `mail ${EMAIL}` },
    };

    expect(sanitizeContext(context)).toEqual({
      title: "[omitted]",
      Subject: "[omitted]",
      body: "[omitted]",
      token: "[omitted]",
      email: "[omitted]",
      eventId: "evt_1",
      nested: { authorization: "[omitted]", note: "mail [email]" },
    });
    expect(
      sanitizeContext({ email: EMAIL }, { hashValue: () => "hashed" }),
    ).toEqual({ email: "hashed" });
  });

  it("omits Riftbound identities and preferences", () => {
    expect(sanitizeContext({ riotId: TOKEN, riftbound: TOKEN, registeredRiotIdHashes: [TOKEN] })).toEqual({
      riotId: "[omitted]", riftbound: "[omitted]", registeredRiotIdHashes: "[omitted]",
    });
  });

  it("survives cyclic objects", () => {
    const cyclic: Record<string, unknown> = { id: "x" };
    cyclic.self = cyclic;
    expect(() => sanitizeContext(cyclic)).not.toThrow();
  });
});
