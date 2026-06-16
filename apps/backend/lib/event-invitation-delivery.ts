import {
  sendAuthEmail,
  type AuthEmailClient,
  type AuthEmailLogger,
  type AuthEmailMessage,
} from "./auth-email";
import { buildMimeMessage, deliverToInternalMailbox } from "./internal-mailbox-delivery";
import { normalizeParticipantEmail } from "./event-participants";
import type { StalwartJmapAdminClientLike } from "./stalwart-admin";

export type EventInvitationDeliveryChannel = "mailbox" | "resend";

export async function sendEventInvitationEmail(input: {
  to: string;
  from: string;
  message: AuthEmailMessage;
  logger: AuthEmailLogger;
  resendClient: AuthEmailClient | null;
  adminClient: StalwartJmapAdminClientLike | null;
  adminToken: string;
  resolveInternalMailbox: (
    email: string,
  ) => Promise<{ stalwartAccountId: string } | null>;
  isProduction: boolean;
  developmentFallbackContext?: Record<string, unknown>;
}): Promise<{
  delivered: boolean;
  channel: EventInvitationDeliveryChannel;
}> {
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
        email,
        channel: "mailbox",
        emailId: result.emailId,
      });
      return { delivered: true, channel: "mailbox" };
    } catch (error) {
      input.logger.warn("Mailbox invitation delivery failed; falling back to Resend", {
        email,
        error,
      });
    }
  }

  const delivered = await sendAuthEmail({
    client: input.resendClient,
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
    delivered,
    channel: "resend",
  };
}
