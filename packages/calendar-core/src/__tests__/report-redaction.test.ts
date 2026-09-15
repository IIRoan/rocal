import { describe, expect, it } from "@jest/globals";
import {
  LOG_HASH_FIELD_KEYS,
  LOG_OMIT_FIELD_KEYS,
  redactPII,
  sanitizeContext,
  sanitizeRequestUrl,
  scrubBreadcrumb,
  scrubErrorEvent,
} from "../report-redaction";

const EMAIL = "alice.smith@example.com";
const TOKEN = "eyJhbGciOiJIUzI1NiJ9.secret-payload.signature";
const SECRET_URL = "https://app.solace.onl/reset?token=abc123&email=alice";

function serialized(value: unknown): string {
  return JSON.stringify(value);
}

function expectNoSecrets(value: unknown) {
  const text = serialized(value);
  expect(text).not.toContain("alice");
  expect(text).not.toContain(TOKEN);
  expect(text).not.toContain("abc123");
  expect(text).not.toContain("Dentist appointment");
  expect(text).not.toContain("Quarterly salary");
  expect(text).not.toContain("session=");
  expect(text).not.toContain("/Users/");
}

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

  it("survives cyclic objects", () => {
    const cyclic: Record<string, unknown> = { id: "x" };
    cyclic.self = cyclic;
    expect(() => sanitizeContext(cyclic)).not.toThrow();
  });
});

describe("scrubErrorEvent", () => {
  it("scrubs every PII-bearing part of a Sentry event", () => {
    const event = {
      event_id: "abc",
      message: `Could not sync ${EMAIL}`,
      user: { id: "user_1", email: EMAIL, ip_address: "203.0.113.9" },
      request: {
        method: "POST",
        url: SECRET_URL,
        query_string: "token=abc123",
        headers: { Authorization: `Bearer ${TOKEN}`, Cookie: "session=xyz" },
        cookies: { session: "xyz" },
        data: { title: "Dentist appointment" },
        env: { REMOTE_ADDR: "203.0.113.9" },
      },
      exception: {
        values: [
          {
            type: "Error",
            value: `JMAP failed for ${EMAIL}: ${SECRET_URL}`,
            stacktrace: {
              frames: [
                {
                  filename: "/Users/alice/solace/apps/backend/lib/auth.ts",
                  function: "handler",
                  lineno: 10,
                  colno: 2,
                  context_line: "const title = 'Dentist appointment'",
                  vars: { title: "Dentist appointment" },
                },
              ],
            },
          },
        ],
      },
      extra: { subject: "Quarterly salary", requestId: "req-1" },
      contexts: { payload: { body: "Dentist appointment", count: 2 } },
      tags: { title: "Dentist appointment", area: "sync" },
      breadcrumbs: [
        { category: "console", message: `log ${EMAIL}` },
        { category: "fetch", data: { url: SECRET_URL, method: "GET" } },
        { category: "ui.click", message: 'button[aria-label="Dentist appointment"]' },
      ],
    };

    const scrubbed = scrubErrorEvent(event);

    expectNoSecrets(scrubbed);
    expect(scrubbed).not.toHaveProperty("user");
    expect(scrubbed.request).toEqual({
      method: "POST",
      url: "https://app.solace.onl/reset?[redacted]",
    });
    expect(scrubbed.exception.values[0]).toEqual({
      type: "Error",
      value: "JMAP failed for [email]: [url]",
      stacktrace: {
        frames: [{ filename: "auth.ts", function: "handler", lineno: 10, colno: 2 }],
      },
    });
    expect(scrubbed.extra).toEqual({ subject: "[omitted]", requestId: "req-1" });
    expect(scrubbed.tags).toEqual({ title: "[omitted]", area: "sync" });
    expect(scrubbed.breadcrumbs).toEqual([
      { category: "fetch", data: { method: "GET", url: "https://app.solace.onl/reset?[redacted]" } },
      { category: "ui.click" },
    ]);
  });

  it("scrubs structured messages", () => {
    const scrubbed = scrubErrorEvent({
      message: { formatted: `hi ${EMAIL}`, params: [EMAIL] },
    });
    expect(scrubbed.message).toEqual({ formatted: "hi [email]" });
  });
});

describe("scrubBreadcrumb", () => {
  it("drops console breadcrumbs and strips navigation queries", () => {
    expect(scrubBreadcrumb({ category: "console", message: EMAIL })).toBeNull();
    expect(
      scrubBreadcrumb({
        category: "navigation",
        data: { from: "/mail?q=alice", to: "/calendar?token=abc123" },
      }),
    ).toEqual({
      category: "navigation",
      data: { from: "/mail?[redacted]", to: "/calendar?[redacted]" },
    });
  });
});
