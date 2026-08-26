import type { AuthEmailClient } from "./auth-email";
import {
  isStalwartMailConfigured,
  jmapBaseUrl,
  sendTransactionalEmailViaStalwart,
} from "./stalwart-jmap-mailer";

function parseAddressFromHeader(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/<([^>]+)>\s*$/);
  return (match?.[1] ?? trimmed).trim();
}

const configuredFrom =
  process.env.EMAIL_FROM?.trim() ||
  parseAddressFromHeader(
    process.env.AUTH_EMAIL_FROM ||
      process.env.AUTH_RESET_EMAIL_FROM ||
      "",
  ) ||
  "noreply@solace.onl";

export const authEmailFromName =
  process.env.EMAIL_FROM_NAME?.trim() || "Solace";

export const authEmailFrom = `${authEmailFromName} <${configuredFrom}>`;

function readMailerConfig() {
  return {
    baseUrl: jmapBaseUrl(
      process.env.STALWART_JMAP_URL || process.env.STALWART_BASE_URL,
    ),
    username: process.env.STALWART_JMAP_USERNAME?.trim() || "",
    password: process.env.STALWART_JMAP_PASSWORD || "",
    from: configuredFrom,
    fromName: authEmailFromName,
  };
}

export function createStalwartAuthEmailClient(
  fetcher: typeof fetch = fetch,
): AuthEmailClient | null {
  const config = readMailerConfig();
  if (!isStalwartMailConfigured(config)) {
    return null;
  }

  return {
    emails: {
      async send(message) {
        try {
          const id = await sendTransactionalEmailViaStalwart(
            config,
            {
              to: message.to,
              subject: message.subject,
              text: message.text,
              html: message.html,
              attachments: message.attachments,
            },
            fetcher,
          );
          return { data: { id }, error: null };
        } catch {
          return {
            data: null,
            error: { message: "Failed to send email" },
          };
        }
      },
    },
  };
}

export const mailer: AuthEmailClient | null = createStalwartAuthEmailClient();
