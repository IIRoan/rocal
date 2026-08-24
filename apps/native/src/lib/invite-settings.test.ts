import type { InviteRecord } from "@workspace/calendar-client";
import {
  INVITE_STATUS_LABELS,
  isInviteRecordActive,
  partitionInviteRecords,
  resolveInviteCopyValue,
} from "./invite-settings";

function invite(
  overrides: Partial<InviteRecord> & Pick<InviteRecord, "id" | "status">,
): InviteRecord {
  return {
    token: `token-${overrides.id}`,
    email: "friend@example.com",
    expiresAt: "2026-08-25T00:00:00.000Z",
    createdAt: "2026-08-20T00:00:00.000Z",
    invitedById: "user-1",
    ...overrides,
  };
}

describe("invite settings helpers", () => {
  const now = new Date("2026-08-24T12:00:00.000Z");

  it("copies a signup URL when the app base URL is configured", () => {
    expect(
      resolveInviteCopyValue(
        { token: "abc 1" },
        "https://app.solace.onl/",
      ),
    ).toBe("https://app.solace.onl/login?invite=abc%201");
    expect(resolveInviteCopyValue({ token: "plain-token" }, null)).toBe(
      "plain-token",
    );
  });

  it("partitions pending invites from expired and completed ones", () => {
    const { active, inactive } = partitionInviteRecords(
      [
        invite({ id: "1", status: "pending" }),
        invite({ id: "2", status: "accepted" }),
        invite({
          id: "3",
          status: "claimed",
          expiresAt: "2026-08-20T00:00:00.000Z",
        }),
      ],
      now,
    );
    expect(active.map((entry) => entry.id)).toEqual(["1"]);
    expect(inactive.map((entry) => entry.id)).toEqual(["2", "3"]);
    expect(isInviteRecordActive(invite({ id: "1", status: "pending" }), now)).toBe(
      true,
    );
    expect(INVITE_STATUS_LABELS.revoked).toBe("Revoked");
  });
});
