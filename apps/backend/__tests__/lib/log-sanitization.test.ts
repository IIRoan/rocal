import { describe, expect, it } from "@jest/globals";
import {
  LOG_OMITTED_PLACEHOLDER,
  LOG_SANITIZATION_POLICY,
  LOG_OMIT_FIELD_KEYS,
  LOG_HASH_FIELD_KEYS,
} from "../../contracts/logging.contract";
import {
  LOG_OMIT_FIELD_KEYS as POLICY_OMIT_FIELD_KEYS,
  LOG_HASH_FIELD_KEYS as POLICY_HASH_FIELD_KEYS,
} from "../../contracts/logging.policy.mjs";
import {
  errorLogDetails,
  logRef,
  redactPII,
  sanitizeLogContext,
  sanitizeRequestUrl,
} from "../../lib/log-sanitization";

describe("log-sanitization", () => {
  it("exposes contract policy as the single source of truth", () => {
    expect(LOG_SANITIZATION_POLICY.helpers).toContain("logRef");
    expect(LOG_SANITIZATION_POLICY.structuredFields.omit).toContain("signupUrl");
    expect(LOG_SANITIZATION_POLICY.structuredFields.hash).toContain("email");
    expect([...LOG_OMIT_FIELD_KEYS]).toEqual([...POLICY_OMIT_FIELD_KEYS]);
    expect([...LOG_HASH_FIELD_KEYS]).toEqual([...POLICY_HASH_FIELD_KEYS]);
  });

  it("hashes identifiers consistently without exposing raw values", () => {
    expect(logRef("user@example.com")).toBe(logRef("user@example.com"));
    expect(logRef("user@example.com")).not.toContain("@");
  });

  it("redacts emails and urls from free-form text", () => {
    expect(
      redactPII(
        "Failed for user@example.com with https://solace.test/reset?token=abc",
      ),
    ).toBe("Failed for [email] with [url]");
  });

  it("sanitizes structured log context", () => {
    expect(
      sanitizeLogContext({
        email: "user@example.com",
        signupUrl: "https://solace.test/login?invite=secret",
        eventId: "event-1",
        error: new Error("smtp rejected user@example.com"),
      }),
    ).toEqual({
      email: logRef("user@example.com"),
      signupUrl: LOG_OMITTED_PLACEHOLDER,
      eventId: "event-1",
      error: {
        errorName: "Error",
        message: "smtp rejected [email]",
      },
    });
  });

  it("redacts query strings from request urls", () => {
    expect(sanitizeRequestUrl("http://localhost/api/invites?token=secret")).toBe(
      "http://localhost/api/invites?[redacted]",
    );
  });

  it("extracts safe error details", () => {
    expect(errorLogDetails(new Error("denied for user@example.com"))).toEqual({
      errorName: "Error",
      message: "denied for [email]",
    });
  });
});
