import { betterAuth } from "better-auth";
import { Manifest } from "elysia";
import { expo } from "@better-auth/expo";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { passkey } from "@better-auth/passkey";
import { createAuthMiddleware } from "@better-auth/core/api";
import { oneTimeToken, jwt } from "better-auth/plugins";
import type { Jwk } from "better-auth/plugins/jwt";
import { createLogger } from "@workspace/logger";
import { prisma } from "./prisma";
import {
  env,
  isDeployedEnvironment,
  resolveBetterAuthSecret,
} from "./env";
import { BETTER_AUTH_BASE_PATH } from "./auth-constants";
import {
  buildPasswordResetEmail,
  buildPasswordUpdatedEmail,
  getPasswordChangeRecipient,
  sendAuthEmail,
} from "./auth-email";
import { mailer, authEmailFrom } from "./email-client";
import { getAuthTrustedOrigins } from "./origin-policy";
import {
  clearPasskeyStepUpCookie,
  setVerifiedPasskeyStepUpCookie,
} from "./passkey-step-up";
import { expireLegacyHostScopedAuthCookies } from "./auth-cookie-migration";
import { inviteService } from "./invite-service";
import { passkeyBridgeFreshSessionPlugin } from "./passkey-bridge-session";
import {
  AUTH_RATE_LIMIT_DEFAULT,
  AUTH_RATE_LIMIT_RULES,
  createAuthRateLimitStorage,
} from "./auth-rate-limit";
import { TRUSTED_CLIENT_IP_HEADERS } from "./rate-limit";
import { stripSessionClientMetadata } from "./auth-utils";

const {
  backendUrl,
  frontendUrl,
  isProduction,
  cookieSameSite,
} = env;

const skipStateCookieCheck =
  process.env.AUTH_SKIP_STATE_COOKIE_CHECK === "true" ||
  (!isProduction && process.env.AUTH_SKIP_STATE_COOKIE_CHECK !== "false");

const passkeyOrigin =
  process.env.PASSKEY_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || frontendUrl;

const logger = createLogger("backend:auth");
const JWKS_CACHE_TTL_MS = 60_000;

// AOT manifest capture imports this module at build time without runtime secrets.
const betterAuthSecret = resolveBetterAuthSecret({
  secret: process.env.BETTER_AUTH_SECRET,
  deployed: isDeployedEnvironment() && !Manifest.isCapturing(),
});

type RawJwtJwkRecord = Awaited<ReturnType<typeof prisma.jwks.findMany>>[number];
type JwtJwkCreateInput = Omit<Jwk, "id">;

let cachedJwks:
  | {
    keys: Jwk[];
    expiresAt: number;
  }
  | null = null;

function normalizeJwk(record: RawJwtJwkRecord): Jwk {
  const jwk: Jwk = {
    id: record.id,
    publicKey: record.publicKey,
    privateKey: record.privateKey,
    createdAt: record.createdAt,
  };

  if (record.expiresAt) {
    jwk.expiresAt = record.expiresAt;
  }

  if (
    record.alg === "EdDSA" ||
    record.alg === "ES256" ||
    record.alg === "ES512" ||
    record.alg === "PS256" ||
    record.alg === "RS256"
  ) {
    jwk.alg = record.alg;
  }

  if (
    record.crv === "Ed25519" ||
    record.crv === "P-256" ||
    record.crv === "P-521"
  ) {
    jwk.crv = record.crv;
  }

  return jwk;
}

async function getCachedJwks(): Promise<Jwk[]> {
  if (cachedJwks && cachedJwks.expiresAt > Date.now()) {
    return cachedJwks.keys;
  }

  const keys = (await prisma.jwks.findMany({
    orderBy: { createdAt: "desc" },
  })).map(normalizeJwk);
  cachedJwks = {
    keys,
    expiresAt: Date.now() + JWKS_CACHE_TTL_MS,
  };

  return keys;
}

async function createCachedJwk(
  data: JwtJwkCreateInput,
): Promise<Jwk> {
  const created = await prisma.jwks.create({
    data: {
      publicKey: data.publicKey,
      privateKey: data.privateKey,
      createdAt: data.createdAt,
      expiresAt: data.expiresAt ?? null,
      alg: data.alg ?? null,
      crv: data.crv ?? null,
    },
  });

  cachedJwks = null;
  return normalizeJwk(created);
}

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

const normalizeBaseUrl = (url: string) => url.replace(/\/+$/, "");

const resolveFrontendRouteUrl = (
  input: string | undefined,
  fallbackPath: string,
) =>
  new URL(
    input?.trim() || fallbackPath,
    frontendUrl.replace(/\/+$/, "") + "/",
  ).toString();

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

  // Narrow without relying on `instanceof Response` (Vercel/Bun typecheck
  // does not always treat the global Response constructor as a type guard).
  if (
    typeof returned === "object" &&
    "ok" in returned &&
    "clone" in returned &&
    typeof (returned as Response).json === "function"
  ) {
    const response = returned as Response;
    if (!response.ok) {
      return null;
    }

    return (await response.clone().json()) as T;
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
    client: mailer,
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

const clearPasskeyStepUpPaths = new Set([
  "/sign-in/email",
  "/sign-up/email",
  "/sign-out",
  "/change-password",
  "/reset-password",
  "/set-password",
]);

const setPasskeyStepUpPaths = new Set([
  "/passkey/verify-authentication",
  "/passkey/verify-registration",
]);

const passkeyStepUpPlugin = {
  id: "passkey-step-up",
  hooks: {
    after: [
      {
        matcher(context: { path?: string }) {
          return Boolean(
            context.path && clearPasskeyStepUpPaths.has(context.path),
          );
        },
        handler: createAuthMiddleware(async (ctx) => {
          if (ctx.context.responseHeaders) {
            const headers = ctx.context.responseHeaders as Headers;
            clearPasskeyStepUpCookie({ headers });
            // Skip legacy Domain=api.* clears on Expo — name-keyed jar would wipe the new session cookie.
            const isExpoClient = Boolean(
              ctx.request?.headers.get("expo-origin")?.trim(),
            );
            if (!isExpoClient) {
              expireLegacyHostScopedAuthCookies(
                { headers },
                { request: ctx.request },
              );
            }
          }
        }),
      },
      {
        matcher(context: { path?: string }) {
          return Boolean(
            context.path && setPasskeyStepUpPaths.has(context.path),
          );
        },
        handler: createAuthMiddleware(async (ctx) => {
          const response = await getSuccessfulEndpointResponse(
            ctx.context.returned,
          );
          if (response && ctx.context.responseHeaders) {
            const session = ctx.context.session as
              | { session?: { id?: string }; user?: { id?: string } }
              | undefined;
            const userId = session?.user?.id;
            const sessionId = session?.session?.id;
            if (userId && sessionId) {
              setVerifiedPasskeyStepUpCookie(
                {
                  headers: ctx.context.responseHeaders as Headers,
                },
                { userId, sessionId },
              );
            }
          }
        }),
      },
    ],
  },
};

const inviteRequiredPlugin = {
  id: "invite-required",
  hooks: {
    before: [
      {
        matcher(context: { path?: string }) {
          return context.path === "/sign-up/email";
        },
        handler: createAuthMiddleware(
          async (ctx): Promise<Response | undefined> => {
            let email: string | undefined;
            try {
              const body = ctx.body as Record<string, unknown> | undefined;
              if (typeof body?.email === "string") {
                email = body.email.trim().toLowerCase();
              }
            } catch {
              // ignore
            }

            if (!email) {
              return new Response(
                JSON.stringify({
                  message: "An invite is required to create an account.",
                }),
                {
                  status: 403,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }

            const check = await inviteService.checkSignupAllowed(email);

            if (!check.allowed) {
              return new Response(
                JSON.stringify({
                  message:
                    check.reason ||
                    "An invite is required to create an account.",
                }),
                {
                  status: 403,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }

            return undefined;
          },
        ),
      },
    ],
    after: [
      {
        matcher(context: { path?: string }) {
          return context.path === "/sign-up/email";
        },
        handler: createAuthMiddleware(async (ctx): Promise<void> => {
          const response = await getSuccessfulEndpointResponse<{
            user?: { email?: string };
          }>(ctx.context.returned);

          const email = response?.user?.email?.trim().toLowerCase();
          if (email) {
            await inviteService.markInviteAccepted(email);
          }
        }),
      },
    ],
  },
};

const authPlugins = [
  expo(),
  passwordChangeNotificationPlugin,
  passkeyStepUpPlugin,
  inviteRequiredPlugin,
  passkey({
    rpID: getRpId(passkeyOrigin),
    rpName: "Rocani",
    origin: passkeyOrigin,
  }),
  oneTimeToken({
    expiresIn: 3,
    storeToken: "hashed",
  }),
  passkeyBridgeFreshSessionPlugin,
  jwt({
    adapter: {
      getJwks: async () => getCachedJwks(),
      createJwk: async (data) => createCachedJwk(data),
    },
  }),
];

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
        client: mailer,
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
  plugins: authPlugins,
  account: {
    // Mobile OAuth often starts in the webview and finishes in the system browser.
    // In local/dev this can split state cookies across contexts.
    skipStateCookieCheck,
  },
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  secret: betterAuthSecret,
  socialProviders: {},
  baseURL: backendUrl,
  basePath: BETTER_AUTH_BASE_PATH,
  trustedOrigins: getAuthTrustedOrigins,
  rateLimit: {
    // Postgres-backed so limits hold across Vercel instances; keys are HMACed.
    enabled: process.env.NODE_ENV !== "test",
    ...AUTH_RATE_LIMIT_DEFAULT,
    customRules: AUTH_RATE_LIMIT_RULES,
    customStorage: createAuthRateLimitStorage(prisma, betterAuthSecret),
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => ({
          data: stripSessionClientMetadata(session),
        }),
      },
    },
  },
  session: {
    storeSessionInDatabase: true,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
  advanced: {
    // IP tracking stays enabled only because disabling it also disables rate limiting.
    ipAddress: {
      ipAddressHeaders: TRUSTED_CLIENT_IP_HEADERS,
    },
    useSecureCookies: isProduction,
    // Better Auth uses `defaultCookieAttributes` — `cookieOptions` is ignored.
    defaultCookieAttributes: {
      sameSite: cookieSameSite,
      secure: isProduction || cookieSameSite === "none",
      httpOnly: true,
    },
    // Omit domain in Better Auth and it becomes the API hostname, not eTLD+1.
    crossSubDomainCookies: {
      enabled: true,
      ...(isProduction
        ? {
          domain: getRpId(backendUrl),
        }
        : {}),
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;
