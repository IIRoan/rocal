import { betterAuth } from "better-auth";
import { expo } from "@better-auth/expo";
import { oauthProvider } from "@better-auth/oauth-provider";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { passkey } from "@better-auth/passkey";
import { createAuthMiddleware } from "@better-auth/core/api";
import { oneTimeToken, openAPI, jwt } from "better-auth/plugins";
import { createLogger } from "@workspace/logger";
import { Resend } from "resend";
import { prisma } from "./prisma";
import { env, getMailOauthConfigurationErrors } from "./env";
import { BETTER_AUTH_BASE_PATH } from "./auth-constants";
import {
  buildPasswordResetEmail,
  buildPasswordUpdatedEmail,
  getPasswordChangeRecipient,
  sendAuthEmail,
} from "./auth-email";
import { getAuthTrustedOrigins } from "./origin-policy";
import {
  clearPasskeyStepUpCookie,
  setVerifiedPasskeyStepUpCookie,
} from "./passkey-step-up";
import {
  buildMailOauthAccessTokenClaims,
  buildMailOauthUserInfoClaims,
} from "./mail-oauth-claims";
import { runMailOauthClientSeedTasks } from "./mail-oauth-bootstrap";

const {
  backendUrl,
  frontendUrl,
  isProduction,
  cookieSameSite,
  mailOauthEnabled,
  mailOauthClientId,
  mailOauthClientSecret,
  mailOauthClientName,
  mailOauthRedirectUris,
  mailOauthBrowserClientId,
  mailOauthBrowserClientName,
  mailOauthBrowserRedirectUris,
  mailOauthPostLogoutRedirectUris,
  mailOauthScopes,
  mailOauthAudiences,
  mailOauthCachedTrustedClientIds,
  mailOauthLoginPage,
  mailOauthConsentPage,
  mailOauthPairwiseSecret,
  stalwartBaseUrl,
} = env;

export const isMailOauthEnabled = mailOauthEnabled;

const skipStateCookieCheck =
  process.env.AUTH_SKIP_STATE_COOKIE_CHECK === "true" ||
  (!isProduction && process.env.AUTH_SKIP_STATE_COOKIE_CHECK !== "false");

const passkeyOrigin =
  process.env.PASSKEY_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || frontendUrl;

const logger = createLogger("backend:auth");
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;
const authEmailFrom =
  process.env.AUTH_EMAIL_FROM ||
  process.env.AUTH_RESET_EMAIL_FROM || "Solace <notifications@mailing.roan.dev>";

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

const resolveFrontendRouteUrl = (input: string | undefined, fallbackPath: string) =>
  new URL(
    input?.trim() || fallbackPath,
    frontendUrl.replace(/\/+$/, "") + "/",
  ).toString();

const mailOauthTrustedClientIds =
  [...mailOauthCachedTrustedClientIds, mailOauthClientId, mailOauthBrowserClientId]
    .map((value) => value.trim())
    .filter(Boolean);

const mailOauthValidAudiences =
  mailOauthAudiences.length > 0 ? mailOauthAudiences : [stalwartBaseUrl];

const mailOauthLoginPageUrl = resolveFrontendRouteUrl(
  mailOauthLoginPage,
  "/login",
);
const mailOauthConsentPageUrl = resolveFrontendRouteUrl(
  mailOauthConsentPage,
  "/mail/oauth/consent",
);
const mailOauthIssuer = `${normalizeBaseUrl(backendUrl)}${BETTER_AUTH_BASE_PATH}`;
const mailOauthConfigurationErrors = getMailOauthConfigurationErrors({
  clientId: mailOauthClientId,
  redirectUris: mailOauthRedirectUris,
  browserClientId: mailOauthBrowserClientId,
  browserRedirectUris: mailOauthBrowserRedirectUris,
});

if (isMailOauthEnabled && mailOauthConfigurationErrors.length > 0) {
  throw new Error(mailOauthConfigurationErrors[0]!);
}

type PendingMailOauthClientSeed = {
  clientId?: string;
  clientSecret?: string;
} | null;

let pendingMailOauthClientSeed: PendingMailOauthClientSeed = null;
let pendingMailOauthClientSeedLock: Promise<void> = Promise.resolve();

async function withPendingMailOauthClientSeed<T>(
  seed: PendingMailOauthClientSeed,
  callback: () => Promise<T>,
): Promise<T> {
  const previousLock = pendingMailOauthClientSeedLock;
  let releaseLock!: () => void;

  pendingMailOauthClientSeedLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  await previousLock;
  pendingMailOauthClientSeed = seed;

  try {
    return await callback();
  } finally {
    pendingMailOauthClientSeed = null;
    releaseLock();
  }
}

const mailOauthProviderPlugin = isMailOauthEnabled
  ? oauthProvider({
      scopes: mailOauthScopes,
      validAudiences: mailOauthValidAudiences,
      cachedTrustedClients: new Set(mailOauthTrustedClientIds),
      loginPage: mailOauthLoginPageUrl,
      consentPage: mailOauthConsentPageUrl,
      allowDynamicClientRegistration: false,
      disableJwtPlugin: true,
      advertisedMetadata: {
        scopes_supported: mailOauthScopes,
      },
      customAccessTokenClaims: ({ user, scopes, resource, metadata }) =>
        buildMailOauthAccessTokenClaims({
          user,
          scopes,
          resource,
          metadata,
        }),
      customUserInfoClaims: ({ scopes, jwt }) =>
        buildMailOauthUserInfoClaims({
          defaultIssuer: mailOauthIssuer,
          scopes,
          jwt: jwt as Record<string, unknown>,
        }),
      pairwiseSecret: mailOauthPairwiseSecret || undefined,
      generateClientId: () =>
        pendingMailOauthClientSeed?.clientId || crypto.randomUUID(),
      generateClientSecret: () =>
        pendingMailOauthClientSeed?.clientSecret || crypto.randomUUID(),
    })
  : null;

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
          return Boolean(context.path && clearPasskeyStepUpPaths.has(context.path));
        },
        handler: createAuthMiddleware(async (ctx) => {
          if (ctx.context.responseHeaders) {
            clearPasskeyStepUpCookie({
              headers: ctx.context.responseHeaders as Headers,
            });
          }
        }),
      },
      {
        matcher(context: { path?: string }) {
          return Boolean(context.path && setPasskeyStepUpPaths.has(context.path));
        },
        handler: createAuthMiddleware(async (ctx) => {
          const response = await getSuccessfulEndpointResponse(ctx.context.returned);
          if (response && ctx.context.responseHeaders) {
            setVerifiedPasskeyStepUpCookie({
              headers: ctx.context.responseHeaders as Headers,
            });
          }
        }),
      },
    ],
  },
};

const authPlugins: any[] = [
  expo(),
  openAPI({
    disableDefaultReference: true,
  }),
  passwordChangeNotificationPlugin,
  passkeyStepUpPlugin,
  passkey({
    rpID: getRpId(passkeyOrigin),
    rpName: "Rocani",
    origin: passkeyOrigin,
  }),
  oneTimeToken({
    expiresIn: 3,
    storeToken: "hashed",
  }),
  jwt(),
  ...(mailOauthProviderPlugin ? [mailOauthProviderPlugin] : []),
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
  plugins: authPlugins,
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
    {},
  baseURL: backendUrl,
  basePath: BETTER_AUTH_BASE_PATH,
  trustedOrigins: getAuthTrustedOrigins,
  session: {
    storeSessionInDatabase: true,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;

async function findOAuthClientById(clientId: string) {
  return prisma.$queryRaw<Array<{ client_id: string }>>`
    SELECT "client_id"
    FROM "oauth_client"
    WHERE "client_id" = ${clientId}
    LIMIT 1
  `;
}

async function ensureManagedMailOAuthClient(input: {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  clientSecret?: string;
  postLogoutRedirectUris?: string[];
  type: "web" | "user-agent-based";
  tokenEndpointAuthMethod: "client_secret_basic" | "none";
  enableEndSession?: boolean;
}) {
  const existingClient = await findOAuthClientById(input.clientId);

  if (existingClient.length > 0) {
    return existingClient[0];
  }

  logger.info("Seeding managed mail OAuth client", {
    clientId: input.clientId,
    redirectUris: input.redirectUris,
    audiences: mailOauthValidAudiences,
  });

  return withPendingMailOauthClientSeed(
    {
      clientId: input.clientId,
      clientSecret: input.clientSecret,
    },
    () =>
      auth.api.adminCreateOAuthClient({
        body: {
          redirect_uris: input.redirectUris,
          scope: mailOauthScopes.join(" "),
          client_name: input.clientName,
          post_logout_redirect_uris:
            input.postLogoutRedirectUris && input.postLogoutRedirectUris.length > 0
              ? input.postLogoutRedirectUris
              : undefined,
          token_endpoint_auth_method: input.tokenEndpointAuthMethod,
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          type: input.type,
          skip_consent: true,
          enable_end_session: input.enableEndSession ?? false,
          require_pkce: true,
          metadata: {
            audiences: mailOauthValidAudiences,
            issuer: mailOauthIssuer,
          },
        },
      }),
  );
}

export async function ensureMailOAuthClients() {
  if (!isMailOauthEnabled) {
    return [];
  }

  const managedClients = [
    {
      clientId: mailOauthClientId,
      clientName: mailOauthClientName,
      redirectUris: mailOauthRedirectUris,
      clientSecret: mailOauthClientSecret || undefined,
      postLogoutRedirectUris: mailOauthPostLogoutRedirectUris,
      tokenEndpointAuthMethod: mailOauthClientSecret
        ? "client_secret_basic"
        : "none",
      type: mailOauthClientSecret ? "web" : "user-agent-based",
      enableEndSession: mailOauthPostLogoutRedirectUris.length > 0,
    },
    {
      clientId: mailOauthBrowserClientId,
      clientName: mailOauthBrowserClientName,
      redirectUris: mailOauthBrowserRedirectUris,
      tokenEndpointAuthMethod: "none",
      type: "user-agent-based",
    },
  ] as const;

  return runMailOauthClientSeedTasks(
    managedClients.map((client) => () => ensureManagedMailOAuthClient(client)),
  );
}

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
