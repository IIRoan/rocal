import type { InviteRecord } from "@workspace/calendar-client";
import {
  buildInviteSignupUrl,
  isInviteActive,
  partitionInvites,
} from "@workspace/calendar-core";

export const INVITE_STATUS_LABELS: Record<InviteRecord["status"], string> = {
  pending: "Pending",
  claimed: "Claimed",
  accepted: "Accepted",
  revoked: "Revoked",
};

export function resolveInviteCopyValue(
  invite: Pick<InviteRecord, "token">,
  appBaseUrl: string | null,
): string {
  if (appBaseUrl?.trim()) {
    return buildInviteSignupUrl(appBaseUrl, invite.token);
  }
  return invite.token;
}

export function partitionInviteRecords(
  invites: InviteRecord[],
  now: Date = new Date(),
): { active: InviteRecord[]; inactive: InviteRecord[] } {
  return partitionInvites(invites, now);
}

export function isInviteRecordActive(
  invite: InviteRecord,
  now: Date = new Date(),
): boolean {
  return isInviteActive(invite, now);
}
