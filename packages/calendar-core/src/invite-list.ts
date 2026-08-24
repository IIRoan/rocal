export type InviteListStatus = "pending" | "claimed" | "accepted" | "revoked";

export type InviteListItem = {
  status: InviteListStatus;
  expiresAt: string;
};

export function isInviteActive(
  invite: InviteListItem,
  now: Date = new Date(),
): boolean {
  if (invite.status !== "pending" && invite.status !== "claimed") {
    return false;
  }
  const expiresAt = new Date(invite.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) {
    return false;
  }
  return expiresAt.getTime() >= now.getTime();
}

export function partitionInvites<T extends InviteListItem>(
  invites: T[],
  now: Date = new Date(),
): { active: T[]; inactive: T[] } {
  const active: T[] = [];
  const inactive: T[] = [];
  for (const invite of invites) {
    if (isInviteActive(invite, now)) {
      active.push(invite);
    } else {
      inactive.push(invite);
    }
  }
  return { active, inactive };
}

export function buildInviteSignupUrl(appBaseUrl: string, token: string): string {
  const base = appBaseUrl.replace(/\/+$/, "");
  return `${base}/login?invite=${encodeURIComponent(token)}`;
}
