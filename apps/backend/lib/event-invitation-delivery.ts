import {
  sendAuthEmail,
  type AuthEmailClient,
  type AuthEmailLogger,
  type AuthEmailMessage,
  type EmailDeliveryResult,
} from "./auth-email";
import { buildMimeMessage, deliverToInternalMailbox } from "./internal-mailbox-delivery";
import { normalizeParticipantEmail } from "./event-participants";
import type { StalwartJmapAdminClientLike } from "./stalwart-admin";
import { errorLogDetails, logRef } from "./log-sanitization";

export type EventInvitationDeliveryChannel = "mailbox" | "stalwart";

export type EventInvitationDeliveryResult = EmailDeliveryResult & {
  channel: EventInvitationDeliveryChannel;
};

export async function sendEventInvitationEmail(input: {
  to: string;
  from: string;
  message: AuthEmailMessage;
  logger: AuthEmailLogger;
  mailerClient: AuthEmailClient | null;
  adminClient: StalwartJmapAdminClientLike | null;
  adminToken: string;
  resolveInternalMailbox: (
    email: string,
  ) => Promise<{ stalwartAccountId: string } | null>;
  isProduction: boolean;
  developmentFallbackContext?: Record<string, unknown>;
}): Promise<EventInvitationDeliveryResult> {
  const email = normalizeParticipantEmail(input.to);
  const internalMailbox = await input.resolveInternalMailbox(email);

  if (internalMailbox && input.adminClient && input.adminToken.trim()) {
    try {
      const mime = buildMimeMessage({
        from: input.from,
        to: email,
        subject: input.message.subject,
        text: input.message.text,
        html: input.message.html,
        attachments: input.message.attachments?.map((attachment) => ({
          filename: attachment.filename,
          content: attachment.content,
          contentType:
            attachment.contentType || "application/octet-stream; charset=utf-8",
        })),
      });
      const result = await deliverToInternalMailbox({
        adminClient: input.adminClient,
        adminToken: input.adminToken,
        accountId: internalMailbox.stalwartAccountId,
        mime,
      });

      input.logger.info("Sent event invitation email", {
        recipientRef: logRef(email),
        channel: "mailbox",
        emailId: result.emailId,
      });
      return { delivered: true, channel: "mailbox" };
    } catch (error) {
      input.logger.warn("Mailbox invitation delivery failed; falling back to Stalwart submission", {
        recipientRef: logRef(email),
        ...errorLogDetails(error),
      });
    }
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
