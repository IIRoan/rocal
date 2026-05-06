import { notFound } from "next/navigation";
import { MailViewer, type EmailPreview } from "./mail-viewer";

// ─── Fake data ────────────────────────────────────────────────────────────────

const FAKE_NAME = "Alex Rivera";
const FAKE_RESET_URL =
  "https://solace.example.com/reset-password?token=preview_token_abc123xyz456";
const FAKE_SIGN_IN_URL = "https://solace.example.com/login";
const LOGO_URL = "https://solace.onl/favicon-192x192.png";
const APP_URL = "https://solace.example.com";

// ─── Email template helpers ───────────────────────────────────────────────────
// Mirrors apps/backend/lib/auth-email.ts — keep in sync when updating designs.

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildEmailHtml({
  title,
  previewText,
  bodyHtml,
  footerHtml,
}: {
  title: string;
  previewText: string;
  bodyHtml: string;
  footerHtml: string;
}): string {
  const safeLogoUrl = escapeHtml(LOGO_URL);
  const safeAppUrl = escapeHtml(APP_URL);

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

function buildPasswordResetHtml(): string {
  const safeName = escapeHtml(FAKE_NAME);
  const safeResetUrl = escapeHtml(FAKE_RESET_URL);

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
      <tbody><tr><td align="center" valign="middle">
        <a class="email-btn" href="${safeResetUrl}" style='display:inline-block;background:#fff;color:#000;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;line-height:100%;margin:0;text-decoration:none;padding:12px 20px;border:1px solid rgba(0,0,0,0.12);border-bottom:2px solid rgba(0,0,0,0.12);border-radius:12px'>Reset password</a>
      </td></tr></tbody>
    </table>
    <p class="email-footer" style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#a8a8a8">
      If the button doesn&rsquo;t work, copy this link:
      <a href="${safeResetUrl}" style="color:#a8a8a8;text-decoration:underline;word-break:break-all">${safeResetUrl}</a>
    </p>`;

  const footerHtml = `
    <p class="email-footer" style="margin:0 0 4px;font-size:12px;line-height:1.5;color:#a8a8a8">
      If you didn&rsquo;t request a password reset, you can safely ignore this email.
    </p>`;

  return buildEmailHtml({
    title: "Reset your Solace password",
    previewText: "Reset your Solace password — this link expires in 1 hour.",
    bodyHtml,
    footerHtml,
  });
}

function buildPasswordUpdatedHtml(action: "changed" | "reset"): string {
  const safeName = escapeHtml(FAKE_NAME);
  const safeSignInUrl = escapeHtml(FAKE_SIGN_IN_URL);
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
      <tbody><tr><td align="center" valign="middle">
        <a class="email-btn" href="${safeSignInUrl}" style='display:inline-block;background:#fff;color:#000;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;line-height:100%;margin:0;text-decoration:none;padding:12px 20px;border:1px solid rgba(0,0,0,0.12);border-bottom:2px solid rgba(0,0,0,0.12);border-radius:12px'>Open Solace</a>
      </td></tr></tbody>
    </table>`;

  const footerHtml = `
    <p class="email-footer" style="margin:0 0 4px;font-size:12px;line-height:1.5;color:#a8a8a8">
      If you did not make this change, reset your password immediately.
      Visit <a href="${safeSignInUrl}" style="color:#a8a8a8;text-decoration:underline">${safeSignInUrl}</a>.
    </p>`;

  return buildEmailHtml({
    title: `Your Solace password was ${actionText}`,
    previewText: `Your Solace password was successfully ${actionText}.`,
    bodyHtml,
    footerHtml,
  });
}

/** Event reminder with fake data — mirrors apps/notifications/emails/event-reminder.html */
function buildEventReminderHtml(): string {
  const logoUrl = escapeHtml(LOGO_URL);
  const appUrl = escapeHtml(APP_URL);
  const eventUrl = escapeHtml(`${APP_URL}/event/preview-123`);
  const settingsUrl = escapeHtml(`${APP_URL}/settings`);
  const privacyUrl = escapeHtml(`${APP_URL}/privacy`);

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta content="width=device-width, initial-scale=1.0" name="viewport" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>Team Standup - in 15 minutes</title>
  <style>
    :root { color-scheme: light dark; }
    body { background-color: #ffffff !important; color: #1a1a1a !important; }
    @media (prefers-color-scheme: dark) {
      body { background-color: #1a1a1a !important; color: #e5e5e5 !important; }
      .email-title { color: #ffffff !important; }
      .email-subtitle { color: rgba(255,255,255,0.55) !important; }
      .detail-label { color: rgba(255,255,255,0.40) !important; }
      .detail-value { color: #e5e5e5 !important; }
      .email-btn { background: #2a2a2a !important; color: #ffffff !important; border-color: rgba(255,255,255,0.15) !important; }
      .email-hr { background-color: #333 !important; }
      .email-footer { color: #666 !important; }
      .email-footer a { color: #666 !important; }
    }
  </style>
</head>
<body style='margin:0;padding:0;background-color:#ffffff;color:#1a1a1a;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased'>
  <div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0">in 15 minutes for Team Standup.</div>
  <div style="margin:0 auto;max-width:555px;padding:48px 28px 40px">
    <a href="${appUrl}" style="outline:none;text-decoration:none">
      <img src="${logoUrl}" alt="Solace" width="36" height="36" style="display:block;width:36px;height:36px;border:0;margin-bottom:28px" />
    </a>
    <h1 class="email-title" style="margin:0;font-size:22px;line-height:130%;font-weight:700;letter-spacing:-0.01em;color:#000">Team Standup</h1>
    <p class="email-subtitle" style="margin:6px 0 0;font-size:15px;line-height:130%;color:rgba(0,0,0,0.50)">in 15 minutes</p>
    <div style="margin-top:28px">
      <div style="margin-bottom:18px">
        <div class="detail-label" style="font-size:11px;line-height:14px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#999;margin-bottom:4px">When</div>
        <div class="detail-value" style="font-size:16px;line-height:22px;font-weight:400;color:#1a1a1a;word-break:break-word">Monday, Jan 20 &middot; 9:00 AM</div>
      </div>
      <div style="margin-bottom:18px">
        <div class="detail-label" style="font-size:11px;line-height:14px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#999;margin-bottom:4px">Where</div>
        <div class="detail-value" style="font-size:16px;line-height:22px;font-weight:400;color:#1a1a1a;word-break:break-word">Google Meet</div>
      </div>
      <div style="margin-bottom:18px">
        <div class="detail-label" style="font-size:11px;line-height:14px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#999;margin-bottom:4px">Calendar</div>
        <div class="detail-value" style="font-size:16px;line-height:22px;font-weight:400;color:#1a1a1a;word-break:break-word">Work</div>
      </div>
      <div style="margin-bottom:18px">
        <div class="detail-label" style="font-size:11px;line-height:14px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#999;margin-bottom:4px">Duration</div>
        <div class="detail-value" style="font-size:16px;line-height:22px;font-weight:400;color:#1a1a1a;word-break:break-word">30 minutes</div>
      </div>
    </div>
    <table border="0" cellpadding="0" cellspacing="0" style="border-collapse:separate;width:fit-content;line-height:100%;padding:6px 0 0">
      <tbody><tr><td align="center" valign="middle">
        <a class="email-btn" href="${eventUrl}" style='display:inline-block;background:#fff;color:#000;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;line-height:100%;margin:0;text-decoration:none;padding:12px 20px;border:1px solid rgba(0,0,0,0.12);border-bottom:2px solid rgba(0,0,0,0.12);border-radius:12px'>Open Event</a>
      </td></tr></tbody>
    </table>
    <hr class="email-hr" style="border:none;height:1px;background-color:#e5e5e5;margin:36px 0 20px 0" />
    <p class="email-footer" style="margin:0 0 6px;font-size:12px;line-height:1.4;color:#a8a8a8;font-weight:600">Solace</p>
    <p class="email-footer" style="margin:0 0 4px;font-size:12px;line-height:1.5;color:#a8a8a8">
      This reminder was sent because email notifications are enabled for your account.
    </p>
    <p class="email-footer" style="margin:0;font-size:12px;line-height:1.5;color:#a8a8a8">
      <a class="email-footer" href="${settingsUrl}" style="color:#a8a8a8;text-decoration:underline">Settings</a>
      &middot;
      <a class="email-footer" href="${privacyUrl}" style="color:#a8a8a8;text-decoration:underline">Privacy</a>
      &middot;
      <a class="email-footer" href="${appUrl}" style="color:#a8a8a8;text-decoration:underline">Calendar</a>
    </p>
  </div>
</body>
</html>`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DebugMailsPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const previews: EmailPreview[] = [
    {
      id: "password-reset",
      category: "Authentication",
      label: "Password Reset Link",
      description:
        "Sent when a user requests a password reset. Contains a one-time link valid for 1 hour.",
      subject: "Reset your Solace password",
      html: buildPasswordResetHtml(),
    },
    {
      id: "password-changed",
      category: "Authentication",
      label: "Password Changed",
      description:
        "Security notification sent after a user successfully changes their password from account settings.",
      subject: "Your Solace password was updated",
      html: buildPasswordUpdatedHtml("changed"),
    },
    {
      id: "password-reset-confirm",
      category: "Authentication",
      label: "Password Reset Confirmation",
      description:
        "Security notification sent after a user resets their password via the email reset link.",
      subject: "Your Solace password was updated",
      html: buildPasswordUpdatedHtml("reset"),
    },
    {
      id: "event-reminder",
      category: "Notifications",
      label: "Event Reminder",
      description:
        "Sent by the notifications service before an event starts. Mirrors apps/notifications/emails/event-reminder.html.",
      subject: "Team Standup - in 15 minutes",
      html: buildEventReminderHtml(),
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky header */}
      <div className="border-b border-border/60 bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <h1 className="text-base font-semibold tracking-tight text-foreground">
              Email Previews
            </h1>
            <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
              dev only
            </span>
          </div>
          <p className="text-xs text-muted-foreground hidden sm:block">
            Fake recipient:{" "}
            <span className="text-foreground font-medium">{FAKE_NAME}</span>
            {" · "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px] font-mono">
              apps/backend/lib/auth-email.ts
            </code>
          </p>
        </div>
      </div>

      <MailViewer previews={previews} />
    </div>
  );
}
