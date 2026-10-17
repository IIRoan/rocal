import { buildIcsEventFile } from "@workspace/calendar-ics";
import {
  sendAuthEmail,
  type AuthEmailClient,
  type AuthEmailLogger,
} from "./auth-email";
import { normalizeParticipantEmail } from "./event-participants";
import { logRef } from "./log-sanitization";
import { isReservedSystemEmail, resolveTimezone } from "@workspace/calendar-core";

export type EventRsvpStatus = "accepted" | "declined" | "tentative";

const STATUS_LABEL: Record<EventRsvpStatus, string> = {
  accepted: "Accepted",
  declined: "Declined",
  tentative: "Tentative",
};

/** Organizers match a reply by UID and PARTSTAT, so a sealed title stays opaque. */
export function buildEventRsvpReplyIcs(input: {
  uid: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  timezone: string | null;
  organizerEmail: string;
  attendeeEmail: string;
  attendeeDisplayName?: string | null;
  status: EventRsvpStatus;
}): string {
  return buildIcsEventFile({
    calendar: {
      name: "Solace",
      timezone: resolveTimezone(input.timezone),
      method: "REPLY",
    },
    event: {
      uid: input.uid,
      title: input.title,
      start: input.start,
      end: input.end,
      allDay: input.allDay,
      timezone: input.timezone,
      participants: [
        { email: input.organizerEmail, role: "organizer" },
        {
          email: input.attendeeEmail,
          displayName: input.attendeeDisplayName ?? undefined,
          role: "attendee",
          status: input.status,
        },
      ],
    },
  });
}

/** Best-effort iTIP REPLY; Solace sends it, never the Stalwart calendar. */
export async function sendEventRsvpReply(input: {
  organizerEmail: string;
  attendeeEmail: string;
  attendeeDisplayName?: string | null;
  from: string;
  title: string;
  uid: string;
  start: Date;
  end: Date;
  allDay: boolean;
  timezone: string | null;
  status: EventRsvpStatus;
  mailerClient: AuthEmailClient | null;
  logger: AuthEmailLogger;
  isProduction: boolean;
}): Promise<void> {
  const organizerEmail = normalizeParticipantEmail(input.organizerEmail);
  const attendeeEmail = normalizeParticipantEmail(input.attendeeEmail);

  if (!organizerEmail || isReservedSystemEmail(organizerEmail)) {
    return;
  }

  if (organizerEmail === attendeeEmail) {
    return;
  }

  const icsContent = buildEventRsvpReplyIcs({
    uid: input.uid,
    title: input.title,
    start: input.start,
    end: input.end,
    allDay: input.allDay,
    timezone: input.timezone,
    organizerEmail,
    attendeeEmail,
    attendeeDisplayName: input.attendeeDisplayName,
    status: input.status,
  });
  const label = STATUS_LABEL[input.status];
  const who = input.attendeeDisplayName?.trim() || attendeeEmail;

  await sendAuthEmail({
    client: input.mailerClient,
    from: input.from,
    to: organizerEmail,
    label: "event RSVP reply",
    message: {
      subject: `${label}: ${input.title}`,
      text: `${who} ${input.status} the invitation.`,
      html: `<p>${who} ${input.status} the invitation.</p>`,
      attachments: [
        {
          filename: "reply.ics",
          content: icsContent,
          contentType: "text/calendar; method=REPLY; charset=utf-8",
        },
      ],
    },
    logger: input.logger,
    isProduction: input.isProduction,
    mode: "best-effort",
    developmentFallbackContext: { organizerRef: logRef(organizerEmail) },
  });
}
