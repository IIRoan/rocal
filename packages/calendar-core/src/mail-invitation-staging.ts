import type { Calendar } from "./types";

export const MAIL_INVITATION_STAGING_CALENDAR_NAME = "Invitations";

export function isMailInvitationStagingCalendar(
  calendar: Pick<Calendar, "name" | "isVisible" | "isSyncOnly"> & { kind: string },
): boolean {
  return (
    calendar.kind === "owned" &&
    !calendar.isSyncOnly &&
    calendar.isVisible === false &&
    calendar.name === MAIL_INVITATION_STAGING_CALENDAR_NAME
  );
}
