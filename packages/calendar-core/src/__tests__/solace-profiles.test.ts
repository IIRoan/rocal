import { describe, expect, it } from "@jest/globals";

import {
  buildSolaceProfileAvatarPath,
  normalizeSolaceProfileLookupEmails,
  resolveSolaceProfileAvatarUrl,
  sanitizePublicImageUrl,
  SOLACE_PROFILE_LOOKUP_MAX_EMAILS,
} from "../solace-profiles";

describe("sanitizePublicImageUrl", () => {
  it("accepts https URLs on public hosts", () => {
    expect(sanitizePublicImageUrl("https://cdn.example.com/a.png")).toBe(
      "https://cdn.example.com/a.png",
    );
  });

  it("rejects non-https schemes, credentials, and private hosts", () => {
    expect(sanitizePublicImageUrl("http://cdn.example.com/a.png")).toBeNull();
    expect(
      sanitizePublicImageUrl("https://user:pass@cdn.example.com/a.png"),
    ).toBeNull();
    expect(sanitizePublicImageUrl("https://127.0.0.1/a.png")).toBeNull();
    expect(sanitizePublicImageUrl("https://10.0.0.8/a.png")).toBeNull();
    expect(sanitizePublicImageUrl("https://192.168.1.4/a.png")).toBeNull();
    expect(sanitizePublicImageUrl("https://169.254.169.254/latest")).toBeNull();
    expect(sanitizePublicImageUrl("https://localhost/a.png")).toBeNull();
    expect(sanitizePublicImageUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizePublicImageUrl("data:image/png;base64,abc")).toBeNull();
    expect(sanitizePublicImageUrl("  ")).toBeNull();
  });
});

describe("normalizeSolaceProfileLookupEmails", () => {
  it("normalizes, deduplicates, and caps the list", () => {
    expect(
      normalizeSolaceProfileLookupEmails([
        "Alice@Example.com",
        "alice@example.com",
        "mailto:bob@example.com",
        "",
      ]),
    ).toEqual(["alice@example.com", "bob@example.com"]);

    const emails = Array.from(
      { length: SOLACE_PROFILE_LOOKUP_MAX_EMAILS + 10 },
      (_, index) => `user${index}@example.com`,
    );
    expect(normalizeSolaceProfileLookupEmails(emails)).toHaveLength(
      SOLACE_PROFILE_LOOKUP_MAX_EMAILS,
    );
  });
});

describe("buildSolaceProfileAvatarPath", () => {
  it("builds a same-origin avatar proxy path", () => {
    expect(buildSolaceProfileAvatarPath("Alice@Example.com")).toBe(
      "/api/profiles/avatar?email=alice%40example.com",
    );
  });
});

describe("resolveSolaceProfileAvatarUrl", () => {
  it("resolves API paths against the configured base URL", () => {
    expect(
      resolveSolaceProfileAvatarUrl(
        "/api/profiles/avatar?email=alice%40example.com",
        "https://cloudflared.roan.dev",
      ),
    ).toBe(
      "https://cloudflared.roan.dev/api/profiles/avatar?email=alice%40example.com",
    );
  });
});
