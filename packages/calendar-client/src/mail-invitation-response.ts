import type {
  CalendarEvent,
  InvitationResponseStatus,
} from "@workspace/calendar-core";
import type { CalendarApiService } from "./calendar-api-service";

type InvitationResponseApi = Pick<
  CalendarApiService,
  | "declineInvitationIcs"
  | "deleteEvent"
  | "getInvitationByExternalId"
  | "importInvitationIcs"
  | "respondToInvitation"
  | "sealImportedInvitationIfNeeded"
>;

export interface MailInvitationResponseInput {
  status: InvitationResponseStatus;
  /** The invitation's ICS UID, which keys its local copy. */
  inviteUid: string;
  icsContent: string | null | undefined;
  /** The local copy of the invitation, when one was imported. */
  event: CalendarEvent | null | undefined;
}

export interface MailInvitationResponse {
  /** The local copy after answering; null once a decline removed it. */
  event: CalendarEvent | null;
  declined: boolean;
  message: string;
}

function answeredMessage(status: InvitationResponseStatus): string {
  return status === "accepted" ? "Invitation accepted." : "Marked as tentative.";
}

/** Answers a mailed invitation over ICS unless its local copy syncs with the mail server, where the API sends the reply. */
export async function respondToMailInvitation(
  api: InvitationResponseApi,
  { status, inviteUid, icsContent, event }: MailInvitationResponseInput,
): Promise<MailInvitationResponse> {
  const eventId = event?.id ?? null;

  if (!eventId || !event?.stalwartEventId) {
    if (!icsContent) {
      throw new Error("Invitation details are unavailable.");
    }
    if (status === "declined") {
      await api.declineInvitationIcs(icsContent);
      if (eventId) {
        await api.deleteEvent(eventId);
      }
      return { event: null, declined: true, message: "Invitation declined." };
    }

    const importSummary = await api.importInvitationIcs(icsContent, { status });
    if (importSummary.errors.length > 0) {
      throw new Error(
        importSummary.errors[0] ??
          "Unable to add this invitation to your calendar.",
      );
    }
    const imported = await api.getInvitationByExternalId(inviteUid, {
      syncRemote: false,
    });
    if (!imported) {
      throw new Error("Invitation was accepted but could not be loaded.");
    }
    return {
      event: await api.sealImportedInvitationIfNeeded(imported),
      declined: false,
      message: answeredMessage(status),
    };
  }

  const result = await api.respondToInvitation(eventId, status);
  if ("deleted" in result && result.deleted) {
    return {
      event: null,
      declined: true,
      message: "Invitation declined and removed from your calendar.",
    };
  }
  return {
    event: await api.sealImportedInvitationIfNeeded(result as CalendarEvent),
    declined: false,
    message: answeredMessage(status),
  };
}
