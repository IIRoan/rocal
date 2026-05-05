import { betterAuth } from "better-auth";
import { expo } from "@better-auth/expo";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { passkey } from "@better-auth/passkey";
import { createAuthMiddleware } from "@better-auth/core/api";
import { oneTimeToken, openAPI } from "better-auth/plugins";
import { createLogger } from "@workspace/logger";
import { Resend } from "resend";
import { prisma } from "./prisma";
import { env } from "./env";
import {
  buildPasswordResetEmail,
  buildPasswordUpdatedEmail,
  getPasswordChangeRecipient,
  sendAuthEmail,
} from "./auth-email";
import { getAuthTrustedOrigins } from "./origin-policy";
import { getOAuthProviderCallbackUrl } from "./oauth-urls";

export const BETTER_AUTH_BASE_PATH = "/api/auth";

const { backendUrl, frontendUrl, isProduction, cookieSameSite } = env;

const skipStateCookieCheck =
  process.env.AUTH_SKIP_STATE_COOKIE_CHECK === "true" ||
  (!isProduction && process.env.AUTH_SKIP_STATE_COOKIE_CHECK !== "false");

const passkeyOrigin =
  process.env.PASSKEY_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || frontendUrl;

const socialRedirectUrl =
  process.env.AUTH_REDIRECT_URL ||
  env.mobileAuthCallbackUrl ||
  process.env.NEXT_PUBLIC_APP_URL ||
  frontendUrl;

const logger = createLogger("backend:auth");
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;
const authEmailFrom =
  process.env.AUTH_EMAIL_FROM ||
  process.env.AUTH_RESET_EMAIL_FROM || "Solace <notifications@mailing.roan.dev>";

export const githubOAuthCallbackUrl = getOAuthProviderCallbackUrl(
  backendUrl,
  BETTER_AUTH_BASE_PATH,
  "github",
);

// Extract root domain for rpID (e.g., "cal.roan.dev" -> "roan.dev")
const getRpId = (url: string) => {
  try {
    const hostname = new URL(url).hostname;
    if (hostname === "localhost") return "localhost";
    const parts = hostname.split(".");
    // Get root domain (last two parts: roan.dev)
    return parts.slice(-2).join(".");
  } catch {
    return "localhost";
  }
};

const passwordSecurityUrl = new URL(
  "/login",
  frontendUrl.replace(/\/+$/, "") + "/",
).toString();

async function getSuccessfulEndpointResponse<T>(
  returned: unknown,
): Promise<T | null> {
  if (!returned) {
    return null;
  }

  if (returned instanceof Response) {
    if (!returned.ok) {
      return null;
    }

    return (await returned.clone().json()) as T;
  }

  return returned as T;
}

async function sendPasswordUpdatedNotification({
  email,
  name,
  action,
}: {
  email: string;
  name: string;
  action: "changed" | "reset";
}) {
  const message = buildPasswordUpdatedEmail({
    name,
    action,
    signInUrl: passwordSecurityUrl,
  });

  await sendAuthEmail({
    client: resend,
    from: authEmailFrom,
    to: email,
    label: "password update notification",
    message,
    logger,
    isProduction,
    mode: "best-effort",
    developmentFallbackContext: {
      action,
      signInUrl: passwordSecurityUrl,
    },
  });
}

const passwordChangeNotificationPlugin = {
  id: "password-change-notification",
  hooks: {
    after: [
      {
        matcher(context: { path?: string }) {
          return context.path === "/change-password";
        },
        handler: createAuthMiddleware(async (ctx) => {
          const response = await getSuccessfulEndpointResponse<{
            user?: {
              email?: string;
              name?: string | null;
            };
          }>(ctx.context.returned);
          const recipient = getPasswordChangeRecipient(response);

          if (!recipient) {
            logger.warn(
              "Password change succeeded but no user email was returned for notification.",
            );
            return;
          }

          await sendPasswordUpdatedNotification({
            email: recipient.email,
            name: recipient.name,
            action: "changed",
          });
        }),
      },
    ],
  },
};

export const auth = betterAuth({
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      const displayName = user.name?.trim() || "there";
      const email = user.email?.trim();

      if (!email) {
        logger.error("Cannot send password reset email without a user email", {
          userId: user.id,
        });
        throw new Error("Password reset email could not be delivered.");
      }

      const message = buildPasswordResetEmail({
        name: displayName,
        resetUrl: url,
      });
      await sendAuthEmail({
        client: resend,
        from: authEmailFrom,
        to: email,
        label: "password reset",
        message,
        logger,
        isProduction,
        developmentFallbackContext: { url },
      });
    },
    onPasswordReset: async ({ user }) => {
      const email = user.email?.trim();

      if (!email) {
        logger.error("Password was reset but the user email is missing.", {
          userId: user.id,
        });
        return;
      }

      await sendPasswordUpdatedNotification({
        email,
        name: user.name?.trim() || "there",
        action: "reset",
      });
    },
  },
  plugins: [
    expo(),
    openAPI({
      disableDefaultReference: true,
    }),
    passwordChangeNotificationPlugin,
    passkey({
      rpID: getRpId(passkeyOrigin),
      rpName: "Rocani",
      origin: passkeyOrigin,
    }),
    oneTimeToken({
      expiresIn: 3,
      storeToken: "hashed",
    }),
  ],
  account: {
    // Mobile OAuth often starts in the webview and finishes in the system browser.
    // In local/dev this can split state cookies across contexts.
    skipStateCookieCheck,
  },
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  secret:
    process.env.BETTER_AUTH_SECRET || "default-dev-secret-change-in-production",
  socialProviders:
    process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? {
          github: {
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
          },
        }
      : {},
  baseURL: backendUrl,
  basePath: BETTER_AUTH_BASE_PATH,
  trustedOrigins: getAuthTrustedOrigins,
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
  advanced: {
    useSecureCookies: isProduction,
    cookieOptions: {
      sameSite: cookieSameSite,
      secure: isProduction,
      httpOnly: true,
      domain: isProduction ? getRpId(backendUrl) : undefined,
    },
    // Cross subdomain cookie sharing for mobile OAuth flow
    crossSubDomainCookies: {
      enabled: true,
    },
  },
  socialProviderConfig: {
    redirectURL: socialRedirectUrl,
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;

type AuthOpenApiSchema = {
  components?: Record<string, unknown>;
  paths?: Record<string, Record<string, { tags?: string[] }>>;
};

let authOpenApiSchemaPromise: Promise<AuthOpenApiSchema> | null = null;

async function getGeneratedAuthOpenApiSchema(): Promise<AuthOpenApiSchema> {
  authOpenApiSchemaPromise ??= Promise.resolve(
    auth.api.generateOpenAPISchema(),
  ) as Promise<AuthOpenApiSchema>;

  return authOpenApiSchemaPromise;
}

export async function getAuthOpenApiDocumentation(
  prefix = BETTER_AUTH_BASE_PATH,
) {
  const normalizedPrefix = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  const schema = await getGeneratedAuthOpenApiSchema();
  const prefixedPaths: Record<string, Record<string, { tags?: string[] }>> = {};

  for (const [path, pathItem] of Object.entries(schema.paths ?? {})) {
    const operationPath = `${normalizedPrefix}${path}`;
    prefixedPaths[operationPath] = pathItem;

    for (const operation of Object.values(pathItem)) {
      operation.tags = ["Better Auth"];
    }
  }

  return {
    components: schema.components ?? {},
    paths: prefixedPaths,
  };
}
