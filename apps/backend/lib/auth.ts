import { betterAuth } from "better-auth";
import { expo } from "@better-auth/expo";
import { oauthProvider } from "@better-auth/oauth-provider";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { passkey } from "@better-auth/passkey";
import { createAuthMiddleware } from "@better-auth/core/api";
import { oneTimeToken, openAPI, jwt } from "better-auth/plugins";
import type { Jwk } from "better-auth/plugins/jwt";
import { createLogger } from "@workspace/logger";
import { prisma } from "./prisma";
import { env, getMailOauthConfigurationErrors } from "./env";
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
import {
  buildMailOauthAccessTokenClaims,
  buildMailOauthUserInfoClaims,
} from "./mail-oauth-claims";
import { runMailOauthClientSeedTasks } from "./mail-oauth-bootstrap";
import {
  buildManagedMailOauthClientState,
  managedMailOauthClientNeedsUpdate,
  type ManagedMailOauthClientInput,
} from "./mail-oauth-managed-client";
import { inviteService } from "./invite-service";
import { passkeyBridgeFreshSessionPlugin } from "./passkey-bridge-session";

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
const JWKS_CACHE_TTL_MS = 60_000;

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

const mailOauthTrustedClientIds = [
  ...mailOauthCachedTrustedClientIds,
  mailOauthClientId,
  mailOauthBrowserClientId,
].flatMap((value) => {
  const trimmed = value.trim();
  return trimmed ? [trimmed] : [];
});

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

const mailOauthProviderPlugin = isMailOauthEnabled
  ? oauthProvider({
    scopes: mailOauthScopes,
    validAudiences: mailOauthValidAudiences,
    cachedTrustedClients: new Set(mailOauthTrustedClientIds),
    loginPage: mailOauthLoginPageUrl,
    consentPage: mailOauthConsentPageUrl,
    allowDynamicClientRegistration: false,
    silenceWarnings: {
      oauthAuthServerConfig: true,
      openidConfig: true,
    },
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
    generateClientId: () => crypto.randomUUID(),
    generateClientSecret: () => crypto.randomUUID(),
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
            // Also expire pre-migration host-scoped session cookies
            // (Domain=api.*) that Better Auth's eTLD+1 clear misses.
            expireLegacyHostScopedAuthCookies(
              { headers },
              { request: ctx.request },
            );
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
            setVerifiedPasskeyStepUpCookie({
              headers: ctx.context.responseHeaders as Headers,
            });
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
  openAPI({
    disableDefaultReference: true,
  }),
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
  secret:
    process.env.BETTER_AUTH_SECRET || "default-dev-secret-change-in-production",
  socialProviders: {},
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

async function findOAuthClientById(clientId: string) {
  return prisma.oauthClient.findUnique({
    where: { clientId },
    select: {
      clientId: true,
      clientSecret: true,
      name: true,
      redirectUris: true,
      postLogoutRedirectUris: true,
      tokenEndpointAuthMethod: true,
      grantTypes: true,
      responseTypes: true,
      type: true,
      skipConsent: true,
      enableEndSession: true,
      metadata: true,
    },
  });
}

async function ensureManagedMailOAuthClient(input: ManagedMailOauthClientInput) {
  const existingClient = await findOAuthClientById(input.clientId);
  const desiredClient = buildManagedMailOauthClientState({
    client: input,
    audiences: mailOauthValidAudiences,
    issuer: mailOauthIssuer,
  });
  const isPublicClient = desiredClient.tokenEndpointAuthMethod === "none";

  if (!isPublicClient) {
    throw new Error(
      `Managed confidential mail OAuth client '${input.clientId}' is not supported during startup reconciliation.`,
    );
  }

  const managedClientData = {
    clientSecret: null,
    disabled: false,
    scopes: mailOauthScopes,
    name: desiredClient.name,
    redirectUris: desiredClient.redirectUris,
    postLogoutRedirectUris: desiredClient.postLogoutRedirectUris,
    tokenEndpointAuthMethod: desiredClient.tokenEndpointAuthMethod,
    grantTypes: desiredClient.grantTypes,
    responseTypes: desiredClient.responseTypes,
    public: true,
    type: desiredClient.type,
    skipConsent: desiredClient.skipConsent,
    enableEndSession: desiredClient.enableEndSession,
    requirePKCE: true,
    metadata: desiredClient.metadata,
  } as const;

  if (existingClient) {
    if (
      managedMailOauthClientNeedsUpdate({
        existing: existingClient,
        desired: desiredClient,
      })
    ) {
      logger.info("Updating managed mail OAuth client", {
        clientId: input.clientId,
        redirectUris: input.redirectUris,
        audiences: mailOauthValidAudiences,
      });

      await prisma.oauthClient.update({
        where: { clientId: input.clientId },
        data: managedClientData,
      });

      return findOAuthClientById(input.clientId);
    }

    return existingClient;
  }

  logger.info("Seeding managed mail OAuth client", {
    clientId: input.clientId,
    redirectUris: input.redirectUris,
    audiences: mailOauthValidAudiences,
  });

  return prisma.oauthClient.create({
    data: {
      clientId: input.clientId,
      ...managedClientData,
    },
  });
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
