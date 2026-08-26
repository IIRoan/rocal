import { describe, expect, it, jest } from "@jest/globals";
import {
  buildPasswordResetEmail,
  buildPasswordUpdatedEmail,
  getPasswordChangeRecipient,
  sendAuthEmail,
  type AuthEmailClient,
  type AuthEmailLogger,
} from "../../lib/auth-email";

const createLogger = (): jest.Mocked<AuthEmailLogger> => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

describe("auth-email", () => {
  it("builds an escaped reset password email", () => {
    const message = buildPasswordResetEmail({
      name: "<Roan>",
      resetUrl: "https://solace.test/reset?token=abc",
    });

    expect(message.subject).toBe("Reset your Solace password");
    expect(message.text).toContain("https://solace.test/reset?token=abc");
    expect(message.text).toContain(
      "GitHub and passkey sign-in keep using a separate encryption password.",
    );
    expect(message.html).toContain("Hi &lt;Roan&gt;");
    expect(message.html).toContain("Reset password");
  });

  it("builds a password updated email with the right action text", () => {
    const message = buildPasswordUpdatedEmail({
      name: "Roan",
      action: "reset",
      signInUrl: "https://solace.test/login",
    });

    expect(message.subject).toBe("Your Solace password was updated");
    expect(message.text).toContain("was reset");
    expect(message.text).toContain(
      "Solace will also use this password to protect your encryption keys.",
    );
    expect(message.html).toContain("Open Solace");
  });

  it("builds a password changed email for the changed action branch", () => {
    const message = buildPasswordUpdatedEmail({
      name: "Roan",
      action: "changed",
      signInUrl: "https://solace.test/login",
    });

    expect(message.text).toContain("was changed");
    expect(message.html).toContain("password was changed");
    expect(message.html).toContain(
      "GitHub and passkey sign-in keep using a separate encryption password.",
    );
  });

  it("extracts the password change recipient from a Better Auth response", () => {
    expect(
      getPasswordChangeRecipient({
        user: {
          email: "  roan@example.com ",
          name: "  Roan  ",
        },
      }),
    ).toEqual({
      email: "roan@example.com",
      name: "Roan",
    });
  });

  it("logs a fallback instead of throwing when a required email provider is missing in development", async () => {
    const logger = createLogger();

    await expect(
      sendAuthEmail({
        client: null,
        from: "Solace <notifications@mailing.roan.dev>",
        to: "roan@example.com",
        label: "password reset",
        message: {
          subject: "Reset",
          text: "Text",
          html: "<p>HTML</p>",
        },
        logger,
        isProduction: false,
        developmentFallbackContext: {
          url: "https://solace.test/reset?token=abc",
        },
      }),
    ).resolves.toEqual({
      delivered: false,
      reason: expect.stringContaining("development"),
    });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("development fallback context omitted"),
      expect.objectContaining({
        recipientRef: expect.any(String),
        label: "password reset",
      }),
    );
  });

  it("throws for required delivery failures from the email provider", async () => {
    const logger = createLogger();
    const client: AuthEmailClient = {
      emails: {
        send: async () => ({
          error: { message: "denied" },
        }),
      },
    };

    await expect(
      sendAuthEmail({
        client,
        from: "Solace <notifications@mailing.roan.dev>",
        to: "roan@example.com",
        label: "password reset",
        message: {
          subject: "Reset",
          text: "Text",
          html: "<p>HTML</p>",
        },
        logger,
        isProduction: true,
      }),
    ).rejects.toThrow("denied");
  });

  it("keeps password update notifications best-effort when delivery fails", async () => {
    const logger = createLogger();
    const client: AuthEmailClient = {
      emails: {
        send: async () => ({
          error: { message: "temporarily unavailable" },
        }),
      },
    };

    await expect(
      sendAuthEmail({
        client,
        from: "Solace <notifications@mailing.roan.dev>",
        to: "roan@example.com",
        label: "password update notification",
        message: {
          subject: "Updated",
          text: "Text",
          html: "<p>HTML</p>",
        },
        logger,
        isProduction: true,
        mode: "best-effort",
      }),
    ).resolves.toEqual({
      delivered: false,
      channel: "stalwart",
      reason: "Failed to send password update notification email. Try again later or contact support.",
    });

    expect(logger.error).toHaveBeenCalledWith(
      "Failed to send password update notification email",
      expect.objectContaining({
        recipientRef: expect.any(String),
        label: "password update notification",
        message: "temporarily unavailable",
      }),
    );
  });
});
