import { Elysia, Manifest } from "elysia";
import { unauthorizedBody } from "./lib/api-error-response";
import { cors } from "@elysia/cors";
import {
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata,
} from "@better-auth/oauth-provider";
import { createLogger, installGlobalConsoleLogger } from "@workspace/logger";
import {
  auth,
  ensureMailOAuthClients,
  isMailOauthEnabled,
} from "./lib/auth";
import { BETTER_AUTH_BASE_PATH } from "./lib/auth-constants";
import { env } from "./lib/env";
import { e2eeRoutes } from "./routes/e2ee";
import { eventsRoutes } from "./routes/events";
import { categoriesRoutes } from "./routes/categories";
import { calendarsRoutes } from "./routes/calendars";
import { settingsRoutes } from "./routes/settings";
import { recentContactsRoutes } from "./routes/recent-contacts";
import { profilesRoutes } from "./routes/profiles";
import { notificationsRoutes } from "./routes/notifications";
import { pushDeviceRoutes } from "./routes/push-devices";
import { recurringRoutes } from "./routes/recurring";
import { subscriptionsRoute } from "./routes/subscriptions";
import { calendarSharingRoutes } from "./routes/calendar-sharing";
import { accountPublicRoutes } from "./routes/account-public";
import { accountRoutes } from "./routes/account";
import { inviteRoutes } from "./routes/invites";
import { mailAccountRoutes } from "./routes/mail-account";
import { mailRoutes } from "./routes/mail";
import { mailSyncRoutes, defaultMailSyncService } from "./routes/mail-sync";
import {
  defaultMailRealtimeService,
  realtimeMailRoutes,
} from "./routes/realtime-mail";
import { createStalwartWebhookRoutes } from "./routes/stalwart-webhook";
import { createStalwartAdminClient } from "./lib/stalwart-admin";
import { StalwartWebhookService } from "./services/stalwart-webhook.service";
import { prisma } from "./lib/prisma";
import { createBetterAuthPlugin } from "./lib/better-auth-plugin";
import { handleApiError } from "./lib/errors";
import { errorLogDetails } from "./lib/log-sanitization";
import { requestContext } from "./lib/request-context";
import { CalendarSyncService } from "./lib/calendar-sync-service";
import { sessionCookieAuthSecurity } from "./lib/openapi";
import { corsOriginPolicy } from "./lib/origin-policy";
import { patchOauthMetadataResponse } from "./lib/oauth-metadata";
import { routeModels } from "./contracts";

installGlobalConsoleLogger("backend");

const logger = createLogger("backend");

const { backendUrl, frontendUrl } = env;

function normalizePath(path: string) {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function getLocalAuthBasePath(prefix: string): string {
  const normalizedPrefix = normalizePath(prefix || "");

  if (normalizedPrefix && BETTER_AUTH_BASE_PATH.startsWith(normalizedPrefix)) {
    const strippedPath = BETTER_AUTH_BASE_PATH.slice(normalizedPrefix.length);
    return normalizePath(strippedPath || "/");
  }

  return normalizePath(BETTER_AUTH_BASE_PATH);
}

if (isMailOauthEnabled && !Manifest.isCapturing()) {
  await ensureMailOAuthClients();
}

const oauthAuthorizationServerMetadata = isMailOauthEnabled
  ? oauthProviderAuthServerMetadata(auth)
  : null;
const oauthOpenIdConfiguration = isMailOauthEnabled
  ? oauthProviderOpenIdConfigMetadata(auth)
  : null;

export const createAPI = (prefix = "") => {
  const app = new Elysia({ prefix, normalize: false });
  const localAuthBasePath = getLocalAuthBasePath(prefix);
  const calendarSyncService = CalendarSyncService.getInstance();

  if (!Manifest.isCapturing()) {
    calendarSyncService.start();
    defaultMailRealtimeService.start();
  }

  return app
    .use(routeModels)
    .use(
      cors({
        origin: (request) =>
          corsOriginPolicy.isOriginAllowed(
            request.headers.get("origin"),
            request,
          ),
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: [
          "Content-Type",
          "Authorization",
          "Cookie",
          "X-Requested-With",
          "Accept",
          "Origin",
        ],
        exposeHeaders: ["Set-Cookie"],
      }),
    )
    .get("/.well-known/oauth-authorization-server", {
      detail: {
        tags: ["Auth"],
        summary: "Get OAuth 2.0 authorization server metadata",
        description:
          "Returns authorization-server metadata for the Solace mail OAuth issuer when mail OAuth is enabled.",
      },
    }, async ({ request, set }) => {
      if (!oauthAuthorizationServerMetadata) {
        set.status = 404;
        return {
          error: "Not found",
          message: "Mail OAuth is not enabled.",
        };
      }
    
      return patchOauthMetadataResponse(
        await oauthAuthorizationServerMetadata(request),
      );
    })
    .get(`${localAuthBasePath}/.well-known/oauth-authorization-server`, {
      detail: {
        tags: ["Auth"],
        summary: "Get OAuth 2.0 authorization server metadata",
        description:
          "Returns authorization-server metadata on the issuer-relative path expected by OIDC clients.",
      },
    }, async ({ request, set }) => {
      if (!oauthAuthorizationServerMetadata) {
        set.status = 404;
        return {
          error: "Not found",
          message: "Mail OAuth is not enabled.",
        };
      }
    
      return patchOauthMetadataResponse(
        await oauthAuthorizationServerMetadata(request),
      );
    })
    .get("/.well-known/openid-configuration", {
      detail: {
        tags: ["Auth"],
        summary: "Get OpenID Connect discovery metadata",
        description:
          "Returns OpenID Connect discovery metadata for the Solace mail OAuth issuer when mail OAuth is enabled.",
      },
    }, async ({ request, set }) => {
      if (!oauthOpenIdConfiguration) {
        set.status = 404;
        return {
          error: "Not found",
          message: "Mail OAuth is not enabled.",
        };
      }
    
      return patchOauthMetadataResponse(
        await oauthOpenIdConfiguration(request),
      );
    })
    .get(`${localAuthBasePath}/.well-known/openid-configuration`, {
      detail: {
        tags: ["Auth"],
        summary: "Get OpenID Connect discovery metadata",
        description:
          "Returns OIDC discovery metadata on the issuer-relative path expected by external clients such as Stalwart.",
      },
    }, async ({ request, set }) => {
      if (!oauthOpenIdConfiguration) {
        set.status = 404;
        return {
          error: "Not found",
          message: "Mail OAuth is not enabled.",
        };
      }
    
      return patchOauthMetadataResponse(
        await oauthOpenIdConfiguration(request),
      );
    })
    .use(requestContext)
    .error("global", handleApiError)
    .use(createBetterAuthPlugin(localAuthBasePath))
    .get("/", {
      detail: {
        tags: ["Health"],
        summary: "API root status",
        description:
          "Simple root endpoint used to verify that the API process is reachable.",
      },
    }, () => ({ message: "API is running" }))
    .get("/health", {
      detail: {
        tags: ["Health"],
        summary: "Health check",
        description:
          "Lightweight liveness probe for uptime checks, deploy verification, and container health monitoring.",
      },
    }, () => ({ status: "ok" }))
    .get("/me", {
      detail: {
        tags: ["Auth"],
        summary: "Get current session user",
        description:
          "Returns the authenticated user when a Better Auth session cookie is present. Returns a null user payload when no session is active.",
      },
    }, async ({ request }) => {
      try {
        const session = await auth.api.getSession({
          headers: request.headers as Headers,
        });
        return session ? { user: session.user } : { user: null };
      } catch {
        return { user: null };
      }
    })
    .get("/user", {
      detail: {
        tags: ["Auth"],
        summary: "Require an authenticated user",
        description:
          "Returns the current user object and fails with 401 when the Better Auth session is missing or invalid.",
        security: sessionCookieAuthSecurity,
      },
    }, async ({ request, status }) => {
      const session = await auth.api.getSession({
        headers: request.headers as Headers,
      });
    
      if (!session) {
        return status(401, unauthorizedBody());
      }
    
      return session.user;
    })
    .get("/test", {
      detail: {
        tags: ["Health"],
        summary: "Backend connectivity test",
        description:
          "Debug endpoint for confirming request routing and current server time during integration checks.",
      },
    }, () => ({
      message: "Backend connection working",
      timestamp: new Date().toISOString(),
    }))
    .use(e2eeRoutes)
    .use(eventsRoutes)
    .use(calendarSharingRoutes)
    .use(categoriesRoutes)
    .use(calendarsRoutes)
    .use(settingsRoutes)
    .use(recentContactsRoutes)
    .use(profilesRoutes)
    .use(notificationsRoutes)
    .use(pushDeviceRoutes)
    .use(recurringRoutes)
    .use(subscriptionsRoute)
    .use(mailRoutes)
    .use(mailAccountRoutes)
    .use(mailSyncRoutes)
    .use(realtimeMailRoutes)
    .use(
      createStalwartWebhookRoutes(
        new StalwartWebhookService({
          prisma,
          mailSyncService: defaultMailSyncService,
        }),
      ),
    )
    .use(accountPublicRoutes)
    .use(accountRoutes)
    .use(inviteRoutes);
};

const port = env.port;
export const app = createAPI("/api");
const calendarSyncService = CalendarSyncService.getInstance();

const shutdown = () => {
  calendarSyncService.stop();
  defaultMailRealtimeService.stop();
};

if (!Manifest.isCapturing()) {
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Handle OAuth errors at root (better-auth redirects here on error)
app.get("/", ({ query, redirect }) => {
  // If there's an OAuth error, redirect to frontend with error
  if (query.error) {
    return redirect(`${frontendUrl}/login?error=${query.error}`);
  }

  // Otherwise redirect to frontend
  return redirect(frontendUrl);
});

if (!Manifest.isCapturing() && import.meta.main) {
  app.listen(port, () => {
    logger.ok(`Server is running on ${backendUrl}`);
    logger.info("Auth runtime config", {
      backendUrl,
      frontendUrl,
      cookieSameSite: process.env.AUTH_COOKIE_SAME_SITE || "lax",
      nodeEnv: process.env.NODE_ENV || "development",
    });

    if (env.stalwartWebhookSecret && env.stalwartAdminToken) {
      void createStalwartAdminClient()
        .ensureMailIngestWebhook({
          url: env.stalwartWebhookUrl,
          secret: env.stalwartWebhookSecret,
        })
        .catch((error) => {
          logger.warn(
            "Failed to ensure Stalwart mail ingest webhook",
            errorLogDetails(error),
          );
        });
    }
  });
}
