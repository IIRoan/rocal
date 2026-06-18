import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../lib/auth-email", () => ({
  sendAuthEmail: jest.fn(async () => ({ delivered: true, channel: "resend" })),
}));

jest.mock("../../lib/internal-mailbox-delivery", () => ({
  buildMimeMessage: jest.fn(() => "MIME"),
  deliverToInternalMailbox: jest.fn(async () => ({ emailId: "email-internal-1" })),
}));

import { sendAuthEmail } from "../../lib/auth-email";
import {
  buildMimeMessage,
  deliverToInternalMailbox,
} from "../../lib/internal-mailbox-delivery";
import { sendEventInvitationEmail } from "../../lib/event-invitation-delivery";
import type { AuthEmailClient } from "../../lib/auth-email";

const mockSendAuthEmail = sendAuthEmail as jest.MockedFunction<
  typeof sendAuthEmail
>;
const mockDeliverToInternalMailbox = deliverToInternalMailbox as jest.MockedFunction<
  typeof deliverToInternalMailbox
>;
const mockBuildMimeMessage = buildMimeMessage as jest.MockedFunction<
  typeof buildMimeMessage
>;

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

function createMockResendClient(): AuthEmailClient {
  return {
    emails: {
      send: jest.fn(async () => ({
        data: { id: "email-1" },
        error: null,
      })),
    },
  };
}

describe("sendEventInvitationEmail", () => {
  beforeEach(() => {
    mockSendAuthEmail.mockClear();
    mockDeliverToInternalMailbox.mockClear();
    mockBuildMimeMessage.mockClear();
    logger.info.mockClear();
    logger.warn.mockClear();
  });

  it("delivers internal mailbox invitations directly into Stalwart", async () => {
    const adminClient = {
      getSession: jest.fn(),
      callJmap: jest.fn(),
    };

    const result = await sendEventInvitationEmail({
      to: "roan@solace.onl",
      from: "Solace <notifications@example.com>",
      message: {
        subject: "Invite",
        text: "Invite text",
        html: "<p>Invite</p>",
        attachments: [
          {
            filename: "invite.ics",
            content: "BEGIN:VCALENDAR",
            contentType: "text/calendar; method=REQUEST; charset=utf-8",
          },
        ],
      },
      logger,
      resendClient: null,
      adminClient: adminClient as never,
      adminToken: "admin-token",
      resolveInternalMailbox: async () => ({
        stalwartAccountId: "acct-roan",
      }),
      isProduction: false,
    });

    expect(result).toEqual({ delivered: true, channel: "mailbox" });
    expect(mockBuildMimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "roan@solace.onl",
      }),
    );
    expect(mockDeliverToInternalMailbox).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "acct-roan",
        mime: "MIME",
      }),
    );
    expect(mockSendAuthEmail).not.toHaveBeenCalled();
  });

  it("uses Resend for recipients without an internal mailbox", async () => {
    const result = await sendEventInvitationEmail({
      to: "friend@gmail.com",
      from: "Solace <notifications@example.com>",
      message: {
        subject: "Invite",
        text: "Invite text",
        html: "<p>Invite</p>",
      },
      logger,
      resendClient: createMockResendClient(),
      adminClient: null,
      adminToken: "",
      resolveInternalMailbox: async () => null,
      isProduction: false,
    });

    expect(result).toEqual({ delivered: true, channel: "resend" });
    expect(mockDeliverToInternalMailbox).not.toHaveBeenCalled();
    expect(mockSendAuthEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "friend@gmail.com",
        label: "event invitation",
      }),
    );
  });

  it("falls back to Resend when mailbox delivery fails", async () => {
    mockDeliverToInternalMailbox.mockRejectedValueOnce(
      new Error("Stalwart import failed"),
    );

    const result = await sendEventInvitationEmail({
      to: "roan@solace.onl",
      from: "Solace <notifications@example.com>",
      message: {
        subject: "Invite",
        text: "Invite text",
        html: "<p>Invite</p>",
      },
      logger,
      resendClient: createMockResendClient(),
      adminClient: { getSession: jest.fn(), callJmap: jest.fn() } as never,
      adminToken: "admin-token",
      resolveInternalMailbox: async () => ({
        stalwartAccountId: "acct-roan",
      }),
      isProduction: false,
    });

    expect(result).toEqual({ delivered: true, channel: "resend" });
    expect(logger.warn).toHaveBeenCalled();
    expect(mockSendAuthEmail).toHaveBeenCalled();
  });
});
