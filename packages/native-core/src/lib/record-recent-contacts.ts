import {
  isAutomatedMailAddress,
  isCurrentUserMailAddress,
  isReservedSystemEmail,
  type RecentContactUsageInput,
} from "@workspace/calendar-core";

export function extractRecentContactEntries(
  participants:
    | Array<{ email: string; displayName?: string | null }>
    | undefined,
  accountEmail?: string | null,
): RecentContactUsageInput[] {
  return (participants ?? [])
    .filter(
      (participant) =>
        !isCurrentUserMailAddress(participant.email, accountEmail) &&
        !isAutomatedMailAddress(participant.email) &&
        !isReservedSystemEmail(participant.email),
    )
    .map((participant) => ({
      email: participant.email,
      displayName: participant.displayName?.trim() || undefined,
    }));
}
