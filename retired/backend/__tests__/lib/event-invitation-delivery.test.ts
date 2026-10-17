import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../lib/auth-email", () => ({
  sendAuthEmail: jest.fn(async () => ({ delivered: true, channel: "stalwart" })),
}));

import { sendAuthEmail } from "../../lib/auth-email";
import { sendEventInvitationEmail } from "../../lib/event-invitation-delivery";
import type { AuthEmailClient } from "../../lib/auth-email";

const mockSendAuthEmail = sendAuthEmail as jest.MockedFunction<
  typeof sendAuthEmail
>;

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

function createMockMailerClient(): AuthEmailClient {
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
    logger.info.mockClear();
    logger.warn.mockClear();
  });

  it("submits internal recipients as noreply, not by importing into their mailbox", async () => {
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
      mailerClient: createMockMailerClient(),
      isProduction: false,
    });

    expect(result).toEqual({ delivered: true, channel: "stalwart" });
    expect(mockSendAuthEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "roan@solace.onl",
        label: "event invitation",
      }),
    );
  });

  it("uses Stalwart submission for external recipients", async () => {
    const result = await sendEventInvitationEmail({
      to: "friend@gmail.com",
      from: "Solace <notifications@example.com>",
      message: {
        subject: "Invite",
        text: "Invite text",
        html: "<p>Invite</p>",
      },
      logger,
      mailerClient: createMockMailerClient(),
      isProduction: false,
    });

    expect(result).toEqual({ delivered: true, channel: "stalwart" });
    expect(mockSendAuthEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "friend@gmail.com",
        label: "event invitation",
      }),
    );
  });

  it("never invites a reserved system address", async () => {
    const result = await sendEventInvitationEmail({
      to: "noreply@solace.onl",
      from: "Solace <notifications@example.com>",
      message: {
        subject: "Invite",
        text: "Invite text",
        html: "<p>Invite</p>",
      },
      logger,
      mailerClient: createMockMailerClient(),
      isProduction: false,
    });

    expect(result).toEqual({ delivered: false, channel: "stalwart" });
    expect(mockSendAuthEmail).not.toHaveBeenCalled();
  });
});
