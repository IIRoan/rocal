import { describe, expect, it } from "@jest/globals";
import { resolveReplyFrom } from "@/lib/mail/reply-identity";
import type { JmapIdentity } from "@/lib/mail/types";

const identities: JmapIdentity[] = [
  { id: "primary", email: "harry@primary.com", name: "Harry" },
  { id: "secondary", email: "harry@secondary.com", name: "Harry Secondary" },
];

describe("resolveReplyFrom", () => {
  it("matches an exact recipient identity", () => {
    expect(
      resolveReplyFrom(identities, { to: [{ email: "harry@secondary.com" }] }),
    ).toEqual({ identityId: "secondary" });
  });

  it("matches plus-addressed recipients to the base identity", () => {
    expect(
      resolveReplyFrom(identities, { to: [{ email: "harry+news@primary.com" }] }),
    ).toEqual({ identityId: "primary" });
  });

  it("returns a catch-all override for owned domains", () => {
    expect(
      resolveReplyFrom(identities, {
        to: [{ email: "catchall@primary.com", name: "Catch" }],
      }),
    ).toEqual({
      identityId: "primary",
      overrideEmail: "catchall@primary.com",
      overrideName: "Catch",
    });
  });

  it("returns null when no identity matches", () => {
    expect(
      resolveReplyFrom(identities, { to: [{ email: "nobody@elsewhere.com" }] }),
    ).toBeNull();
  });
});
