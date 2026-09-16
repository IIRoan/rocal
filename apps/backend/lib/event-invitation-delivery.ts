import {
  sendAuthEmail,
  type AuthEmailClient,
  type AuthEmailLogger,
  type AuthEmailMessage,
  type EmailDeliveryResult,
} from "./auth-email";
import { normalizeParticipantEmail } from "./event-participants";
import { isReservedSystemEmail } from "@workspace/calendar-core";
import { logRef } from "./log-sanitization";

export type EventInvitationDeliveryResult = EmailDeliveryResult & {
  channel: "stalwart";
};

export async function sendEventInvitationEmail(input: {
  to: string;
  from: string;
  message: AuthEmailMessage;
  logger: AuthEmailLogger;
  mailerClient: AuthEmailClient | null;
  isProduction: boolean;
  developmentFallbackContext?: Record<string, unknown>;
}): Promise<EventInvitationDeliveryResult> {
  const email = normalizeParticipantEmail(input.to);

  if (isReservedSystemEmail(email)) {
    input.logger.warn("Skipped event invitation to reserved system email", {
      recipientRef: logRef(email),
    });
    return { delivered: false, channel: "stalwart" };
  }

  const delivery = await sendAuthEmail({
    client: input.mailerClient,
    from: input.from,
    to: email,
    label: "event invitation",
    message: input.message,
    logger: input.logger,
    isProduction: input.isProduction,
    mode: "best-effort",
    developmentFallbackContext: input.developmentFallbackContext,
  });

  return {
    ...delivery,
    channel: "stalwart",
  };
}
