import { describe, expect, it } from "@jest/globals";

import {
  normalizeSolaceProfileLookupEmails,
  resolveSolaceProfileAvatarUrl,
  solaceAvatarVariantSize,
  SOLACE_PROFILE_LOOKUP_MAX_EMAILS,
} from "../solace-profiles";

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

describe("resolveSolaceProfileAvatarUrl", () => {
  it("resolves API paths against the configured base URL", () => {
    expect(
      resolveSolaceProfileAvatarUrl(
        "/api/profiles/avatars/abc",
        "https://cloudflared.roan.dev",
      ),
    ).toBe("https://cloudflared.roan.dev/api/profiles/avatars/abc");
  });

  it("requests the smallest stored variant that covers the display size", () => {
    const base = "https://api.solace.onl";
    expect(
      resolveSolaceProfileAvatarUrl("/api/profiles/avatars/abc", base, 80),
    ).toBe(`${base}/api/profiles/avatars/abc?size=128`);
    expect(
      resolveSolaceProfileAvatarUrl("/api/profiles/avatars/abc", base, 2000),
    ).toBe(`${base}/api/profiles/avatars/abc?size=512`);
    expect(
      resolveSolaceProfileAvatarUrl("https://cdn.example.com/a.png", base, 64),
    ).toBeNull();
  });
});

describe("solaceAvatarVariantSize", () => {
  it("rounds up to a stored size and caps at the largest", () => {
    expect(solaceAvatarVariantSize(1)).toBe(32);
    expect(solaceAvatarVariantSize(64)).toBe(64);
    expect(solaceAvatarVariantSize(65)).toBe(128);
    expect(solaceAvatarVariantSize(4096)).toBe(512);
  });
});
