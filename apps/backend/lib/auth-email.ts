export type AuthEmailMessage = {
  subject: string;
  text: string;
  html: string;
};

export type AuthEmailDeliveryMode = "required" | "best-effort";

export interface AuthEmailClient {
  emails: {
    send(message: {
      from: string;
      to: string;
      subject: string;
      html: string;
      text: string;
    }): Promise<{
      data?: {
        id?: string | null;
      } | null;
      error?: {
        message?: string;
      } | null;
    }>;
  };
}

export interface AuthEmailLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

const DEFAULT_LOGO_URL = "https://solace.onl/favicon-192x192.png";
const DEFAULT_APP_URL = "https://solace.onl";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Builds a full email HTML document matching the event-reminder.html style:
 * logo at top, clean minimal layout, white button with border, footer with links.
 */
function buildEmailHtml({
  title,
  previewText,
  logoUrl,
  appUrl,
  bodyHtml,
  footerHtml,
}: {
  title: string;
  previewText: string;
  logoUrl: string;
  appUrl: string;
  bodyHtml: string;
  footerHtml: string;
}): string {
  const safeLogoUrl = escapeHtml(logoUrl);
  const safeAppUrl = escapeHtml(appUrl);

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta content="width=device-width, initial-scale=1.0" name="viewport" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light dark; }
    body { background-color: #ffffff !important; color: #1a1a1a !important; }
    @media (prefers-color-scheme: dark) {
      body { background-color: #1a1a1a !important; color: #e5e5e5 !important; }
      .email-title { color: #ffffff !important; }
      .email-subtitle { color: rgba(255,255,255,0.55) !important; }
      .email-body { color: rgba(255,255,255,0.75) !important; }
      .detail-label { color: rgba(255,255,255,0.40) !important; }
      .detail-value { color: #e5e5e5 !important; }
      .email-btn { background: #2a2a2a !important; color: #ffffff !important; border-color: rgba(255,255,255,0.15) !important; }
      .email-hr { background-color: #333 !important; }
      .email-footer { color: #555 !important; }
      .email-footer a { color: #555 !important; }
    }
  </style>
</head>
<body style='margin:0;padding:0;background-color:#ffffff;color:#1a1a1a;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased'>
  <div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0">${escapeHtml(previewText)}</div>
  <div style="margin:0 auto;max-width:555px;padding:48px 28px 40px">
    <a href="${safeAppUrl}" style="outline:none;text-decoration:none">
      <img src="${safeLogoUrl}" alt="Solace" width="36" height="36" style="display:block;width:36px;height:36px;border:0;margin-bottom:28px" />
    </a>
    ${bodyHtml}
    <hr class="email-hr" style="border:none;height:1px;background-color:#e5e5e5;margin:36px 0 20px 0" />
    <p class="email-footer" style="margin:0 0 6px;font-size:12px;line-height:1.4;color:#a8a8a8;font-weight:600">Solace</p>
    ${footerHtml}
    <p class="email-footer" style="margin:4px 0 0;font-size:12px;line-height:1.5;color:#a8a8a8">
      <a class="email-footer" href="${safeAppUrl}/settings" style="color:#a8a8a8;text-decoration:underline">Settings</a>
      &middot;
      <a class="email-footer" href="${safeAppUrl}/privacy" style="color:#a8a8a8;text-decoration:underline">Privacy</a>
    </p>
  </div>
</body>
</html>`;
}

export function buildPasswordResetEmail({
  name,
  resetUrl,
  logoUrl = DEFAULT_LOGO_URL,
  appUrl = DEFAULT_APP_URL,
}: {
  name: string;
  resetUrl: string;
  logoUrl?: string;
  appUrl?: string;
}): AuthEmailMessage {
  const safeName = escapeHtml(name);
  const safeResetUrl = escapeHtml(resetUrl);

  const bodyHtml = `
    <h1 class="email-title" style="margin:0;font-size:22px;line-height:130%;font-weight:700;letter-spacing:-0.01em;color:#000">Reset your password</h1>
    <p class="email-subtitle" style="margin:6px 0 0;font-size:15px;line-height:130%;color:rgba(0,0,0,0.50)">Hi ${safeName}</p>
    <p class="email-body" style="margin:20px 0 0;font-size:15px;line-height:1.6;color:#1a1a1a">
      We received a request to reset your Solace password.
      Click the button below to choose a new one &mdash; this link expires in&nbsp;<strong>1&nbsp;hour</strong>.
    </p>
    <p class="email-body" style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#1a1a1a">
      If you sign in with email and password, Solace also uses that password to protect your encryption keys after you sign in. GitHub and passkey sign-in keep using a separate encryption password.
    </p>
    <table border="0" cellpadding="0" cellspacing="0" style="border-collapse:separate;width:fit-content;line-height:100%;padding:24px 0 0">
      <tbody>
        <tr>
          <td align="center" valign="middle">
            <a class="email-btn" href="${safeResetUrl}" style='display:inline-block;background:#fff;color:#000;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;line-height:100%;margin:0;text-decoration:none;padding:12px 20px;border:1px solid rgba(0,0,0,0.12);border-bottom:2px solid rgba(0,0,0,0.12);border-radius:12px'>Reset password</a>
          </td>
        </tr>
      </tbody>
    </table>
    <p class="email-footer" style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#a8a8a8">
      If the button doesn&rsquo;t work, copy this link:
      <a href="${safeResetUrl}" style="color:#a8a8a8;text-decoration:underline;word-break:break-all">${safeResetUrl}</a>
    </p>`;

  const footerHtml = `
    <p class="email-footer" style="margin:0 0 4px;font-size:12px;line-height:1.5;color:#a8a8a8">
      If you didn&rsquo;t request a password reset, you can safely ignore this email. Your password won&rsquo;t change.
    </p>`;

  return {
    subject: "Reset your Solace password",
    text: [
      `Hi ${name},`,
      "",
      "We received a request to reset your Solace password.",
      "If you sign in with email and password, Solace also uses that password to protect your encryption keys after you sign in.",
      "GitHub and passkey sign-in keep using a separate encryption password.",
      "",
      "Use the link below to choose a new password:",
      resetUrl,
      "",
      "This link expires in 1 hour.",
      "",
      "If you did not request this change, you can safely ignore this email.",
    ].join("\n"),
    html: buildEmailHtml({
      title: "Reset your Solace password",
      previewText: `Reset your Solace password — this link expires in 1 hour.`,
      logoUrl,
      appUrl,
      bodyHtml,
      footerHtml,
    }),
  };
}

export function buildPasswordUpdatedEmail({
  name,
  action,
  signInUrl,
  logoUrl = DEFAULT_LOGO_URL,
  appUrl = DEFAULT_APP_URL,
}: {
  name: string;
  action: "changed" | "reset";
  signInUrl: string;
  logoUrl?: string;
  appUrl?: string;
}): AuthEmailMessage {
  const safeName = escapeHtml(name);
  const safeSignInUrl = escapeHtml(signInUrl);
  const actionText = action === "reset" ? "reset" : "changed";

  const bodyHtml = `
    <h1 class="email-title" style="margin:0;font-size:22px;line-height:130%;font-weight:700;letter-spacing:-0.01em;color:#000">Your password was ${escapeHtml(actionText)}</h1>
    <p class="email-subtitle" style="margin:6px 0 0;font-size:15px;line-height:130%;color:rgba(0,0,0,0.50)">Hi ${safeName}</p>
    <p class="email-body" style="margin:20px 0 0;font-size:15px;line-height:1.6;color:#1a1a1a">
      This is a confirmation that your Solace password was successfully <strong>${escapeHtml(actionText)}</strong>.
      If you made this change, no further action is needed &mdash; you&rsquo;re all set.
    </p>
    <p class="email-body" style="margin:16px 0 0;font-size:15px;line-height:1.6;color:#1a1a1a">
      After you sign in with email and password, Solace will also use this password to protect your encryption keys. GitHub and passkey sign-in keep using a separate encryption password.
    </p>
    <table border="0" cellpadding="0" cellspacing="0" style="border-collapse:separate;width:fit-content;line-height:100%;padding:24px 0 0">
      <tbody>
        <tr>
          <td align="center" valign="middle">
            <a class="email-btn" href="${safeSignInUrl}" style='display:inline-block;background:#fff;color:#000;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;line-height:100%;margin:0;text-decoration:none;padding:12px 20px;border:1px solid rgba(0,0,0,0.12);border-bottom:2px solid rgba(0,0,0,0.12);border-radius:12px'>Open Solace</a>
          </td>
        </tr>
      </tbody>
    </table>`;

  const footerHtml = `
    <p class="email-footer" style="margin:0 0 4px;font-size:12px;line-height:1.5;color:#a8a8a8">
      If you did not make this change, reset your password immediately to secure your account.
      Visit <a href="${safeSignInUrl}" style="color:#a8a8a8;text-decoration:underline">${safeSignInUrl}</a>.
    </p>`;

  return {
    subject: "Your Solace password was updated",
    text: [
      `Hi ${name},`,
      "",
      `This is a confirmation that your Solace password was ${actionText}.`,
      "If you made this change, no further action is needed.",
      "After you sign in with email and password, Solace will also use this password to protect your encryption keys.",
      "GitHub and passkey sign-in keep using a separate encryption password.",
      `If you did not make this change, reset your password immediately: ${signInUrl}`,
    ].join("\n"),
    html: buildEmailHtml({
      title: `Your Solace password was ${actionText}`,
      previewText: `Your Solace password was successfully ${actionText}.`,
      logoUrl,
      appUrl,
      bodyHtml,
      footerHtml,
    }),
  };
}

export function getPasswordChangeRecipient(response: unknown): {
  email: string;
  name: string;
} | null {
  if (typeof response !== "object" || response === null || !("user" in response)) {
    return null;
  }

  const user = response.user;
  if (typeof user !== "object" || user === null) {
    return null;
  }

  const email =
    "email" in user && typeof user.email === "string" ? user.email.trim() : "";

  if (!email) {
    return null;
  }

  const name =
    "name" in user && typeof user.name === "string" && user.name.trim()
      ? user.name.trim()
      : "there";

  return { email, name };
}

export async function sendAuthEmail({
  client,
  from,
  to,
  label,
  message,
  logger,
  isProduction,
  mode = "required",
  developmentFallbackContext,
}: {
  client: AuthEmailClient | null;
  from: string;
  to: string;
  label: string;
  message: AuthEmailMessage;
  logger: AuthEmailLogger;
  isProduction: boolean;
  mode?: AuthEmailDeliveryMode;
  developmentFallbackContext?: Record<string, unknown>;
}): Promise<boolean> {
  const email = to.trim();

  if (!email) {
    const errorMessage = `${label} email could not be delivered because the recipient email is missing.`;

    if (mode === "best-effort") {
      logger.error(errorMessage);
      return false;
    }

    throw new Error(errorMessage);
  }

  if (!client) {
    const errorMessage = `${label} email provider is not configured on the backend.`;

    if (!isProduction && developmentFallbackContext) {
      logger.warn(`${errorMessage} Logging the email details instead.`, {
        email,
        ...developmentFallbackContext,
      });
      return false;
    }

    if (mode === "best-effort") {
      logger.error(errorMessage, { email });
      return false;
    }

    throw new Error(errorMessage);
  }

  try {
    const result = await client.emails.send({
      from,
      to: email,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    if (result.error) {
      throw new Error(result.error.message || `Failed to send ${label} email.`);
    }

    logger.info(`Sent ${label} email`, {
      email,
      resendId: result.data?.id ?? null,
    });
    return true;
  } catch (error) {
    if (mode === "best-effort") {
      logger.error(`Failed to send ${label} email`, { email, error });
      return false;
    }

    throw error instanceof Error
      ? error
      : new Error(`Failed to send ${label} email.`);
  }
}
