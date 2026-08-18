import type { EventParticipantInput } from "@workspace/calendar-core";

export function formatParticipantStatus(status?: string) {
  switch (status) {
    case "accepted":
      return "Accepted";
    case "declined":
      return "Declined";
    case "tentative":
      return "Tentative";
    default:
      return "Invited";
  }
}

export function getParticipantInitials(
  participant: Pick<EventParticipantInput, "displayName" | "email"> & {
    image?: string | null;
  },
) {
  const label = participant.displayName?.trim() || participant.email.trim();
  const segments = label
    .replace(/@.*$/, "")
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2);

  return (
    segments.map((segment) => segment[0]?.toUpperCase() ?? "").join("") || "P"
  );
}
