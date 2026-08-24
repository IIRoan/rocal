import { describe, expect, it } from "@jest/globals";

import {
  buildInviteSignupUrl,
  isInviteActive,
  partitionInvites,
} from "./invite-list";

describe("invite list helpers", () => {
  const now = new Date("2026-08-24T12:00:00.000Z");

  it("treats pending and claimed invites as active until they expire", () => {
    expect(
      isInviteActive(
        { status: "pending", expiresAt: "2026-08-25T00:00:00.000Z" },
        now,
      ),
    ).toBe(true);
    expect(
      isInviteActive(
        { status: "claimed", expiresAt: "2026-08-25T00:00:00.000Z" },
        now,
      ),
    ).toBe(true);
    expect(
      isInviteActive(
        { status: "pending", expiresAt: "2026-08-23T00:00:00.000Z" },
        now,
      ),
    ).toBe(false);
    expect(
      isInviteActive(
        { status: "revoked", expiresAt: "2026-08-25T00:00:00.000Z" },
        now,
      ),
    ).toBe(false);
  });

  it("partitions active invites from expired, accepted, and revoked ones", () => {
    const { active, inactive } = partitionInvites(
      [
        { id: "1", status: "pending", expiresAt: "2026-08-25T00:00:00.000Z" },
        { id: "2", status: "accepted", expiresAt: "2026-08-25T00:00:00.000Z" },
        { id: "3", status: "claimed", expiresAt: "2026-08-20T00:00:00.000Z" },
      ],
      now,
    );

    expect(active.map((invite) => invite.id)).toEqual(["1"]);
    expect(inactive.map((invite) => invite.id)).toEqual(["2", "3"]);
  });

  it("builds a signup URL with the invite token", () => {
    expect(buildInviteSignupUrl("https://app.solace.onl/", "tok 1")).toBe(
      "https://app.solace.onl/login?invite=tok%201",
    );
  });
});
