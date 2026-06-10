import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import {
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata,
} from "@better-auth/oauth-provider";
import { createLogger, installGlobalConsoleLogger } from "@workspace/logger";
import {
  auth,
  ensureMailOAuthClients,
  getAuthOpenApiDocumentation,
  isMailOauthEnabled,
} from "./lib/auth";
import { BETTER_AUTH_BASE_PATH } from "./lib/auth-constants";
import { env } from "./lib/env";
import { e2eeRoutes } from "./routes/e2ee";
import { eventsRoutes } from "./routes/events";
import { categoriesRoutes } from "./routes/categories";
import { calendarsRoutes } from "./routes/calendars";
import { settingsRoutes } from "./routes/settings";
import { notificationsRoutes } from "./routes/notifications";
import { recurringRoutes } from "./routes/recurring";
import { subscriptionsRoute } from "./routes/subscriptions";
import { calendarSharingRoutes } from "./routes/calendar-sharing";
import { accountPublicRoutes } from "./routes/account-public";
import { accountRoutes } from "./routes/account";
import { inviteRoutes } from "./routes/invites";
import { mailAccountRoutes } from "./routes/mail-account";
import { mailRoutes } from "./routes/mail";
import { mailSyncRoutes } from "./routes/mail-sync";
import {
  defaultMailRealtimeService,
  realtimeMailRoutes,
} from "./routes/realtime-mail";
import { errorHandler, UnauthorizedError } from "./lib/errors";
import { CalendarSyncService } from "./lib/calendar-sync-service";
import {
  API_DOCS_SPEC_PATH,
  API_DOCS_UI_PATH,
  createApiDocsErrorBody,
  getApiDocsAccess,
} from "./lib/docs-access";
import {
  apiDocumentationDescription,
  apiDocumentationTags,
  apiSecuritySchemes,
  sessionCookieAuthSecurity,
} from "./lib/openapi";
import { corsOriginPolicy } from "./lib/origin-policy";
import { patchOauthMetadataResponse } from "./lib/oauth-metadata";

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

async function buildApiDocumentation() {
  try {
    const authDocumentation = await getAuthOpenApiDocumentation();
    const authComponents = authDocumentation.components ?? {};
    const authSecuritySchemes =
      "securitySchemes" in authComponents &&
      authComponents.securitySchemes &&
      typeof authComponents.securitySchemes === "object"
        ? (authComponents.securitySchemes as Record<string, unknown>)
        : {};

    return {
      info: {
        title: "Rocani API Reference",
        version: "1.0.0",
        description: apiDocumentationDescription,
      },
      tags: apiDocumentationTags,
      components: {
        ...authComponents,
        securitySchemes: {
          ...authSecuritySchemes,
          ...apiSecuritySchemes,
        },
      },
      paths: authDocumentation.paths,
    };
  } catch (error) {
    logger.warn("Failed to generate Better Auth OpenAPI schema", { error });

    return {
      info: {
        title: "Rocani API Reference",
        version: "1.0.0",
        description: apiDocumentationDescription,
      },
      tags: apiDocumentationTags,
      components: {
        securitySchemes: apiSecuritySchemes,
      },
    };
  }
}

if (isMailOauthEnabled) {
  await ensureMailOAuthClients();
}

const apiDocumentation = await buildApiDocumentation();
const oauthAuthorizationServerMetadata = isMailOauthEnabled
  ? oauthProviderAuthServerMetadata(auth)
  : null;
const oauthOpenIdConfiguration = isMailOauthEnabled
  ? oauthProviderOpenIdConfigMetadata(auth)
  : null;

// Better Auth middleware
const betterAuth = new Elysia({ name: "better-auth" })
  .mount(auth.handler)
  .derive(async ({ request }) => {
    try {
      const session = await auth.api.getSession({
        headers: request.headers as Headers,
      });

      return {
        user: session?.user,
        session: session?.session,
      };
    } catch (error) {
      logger.error("Auth Middleware Error:", error);
      return {
        user: null,
        session: null,
      };
    }
  });

export const createAPI = (prefix = "") => {
  const app = new Elysia({ prefix, normalize: false });
  const docsUiPath = normalizePath(
    `${prefix}${API_DOCS_UI_PATH}` || API_DOCS_UI_PATH,
  );
  const docsSpecPath = normalizePath(
    `${prefix}${API_DOCS_SPEC_PATH}` || API_DOCS_SPEC_PATH,
  );
  const authOpenApiSchemaPath = normalizePath(
    `${prefix}${BETTER_AUTH_BASE_PATH}/open-api/generate-schema`,
  );
  const localAuthBasePath = getLocalAuthBasePath(prefix);

  const calendarSyncService = CalendarSyncService.getInstance();

  app
    .onBeforeHandle(async ({ request, set }) => {
      const pathname = normalizePath(new URL(request.url).pathname);

      if (
        pathname !== docsUiPath &&
        pathname !== docsSpecPath &&
        pathname !== authOpenApiSchemaPath
      ) {
        return;
      }

      const result = await getApiDocsAccess(request);
      const requestAwareLoginUrl = new URL(
        "/login",
        frontendUrl.replace(/\/+$/, "") + "/",
      );
      requestAwareLoginUrl.searchParams.set("callbackURL", request.url);
      const loginUrl = requestAwareLoginUrl.toString();

      if (result.allowed) {
        return;
      }

      if (pathname === docsUiPath && result.status === 401) {
        return new Response(null, {
          status: 302,
          headers: {
            Location: loginUrl,
            "Cache-Control": "no-store, max-age=0",
          },
        });
      }

      set.status = result.status;
      set.headers["Cache-Control"] = "no-store, max-age=0";

      if (pathname === docsSpecPath || pathname === authOpenApiSchemaPath) {
        return createApiDocsErrorBody(result);
      }

      return new Response(result.message, {
        status: result.status,
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    })
    .use(
      swagger({
        path: API_DOCS_UI_PATH,
        specPath: API_DOCS_SPEC_PATH,
        documentation: apiDocumentation,
        scalarConfig: {
          theme: "none",
          layout: "modern",
          darkMode: false,
          withDefaultFonts: false,
          hideDownloadButton: false,
          searchHotKey: "k",
        },
      }),
    );

  calendarSyncService.start();
  defaultMailRealtimeService.start();

  return app
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
    .get(
      "/.well-known/oauth-authorization-server",
      async ({ request, set }) => {
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
      },
      {
        detail: {
          tags: ["Auth"],
          summary: "Get OAuth 2.0 authorization server metadata",
          description:
            "Returns authorization-server metadata for the Solace mail OAuth issuer when mail OAuth is enabled.",
        },
      },
    )
    .get(
      `${localAuthBasePath}/.well-known/oauth-authorization-server`,
      async ({ request, set }) => {
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
      },
      {
        detail: {
          tags: ["Auth"],
          summary: "Get OAuth 2.0 authorization server metadata",
          description:
            "Returns authorization-server metadata on the issuer-relative path expected by OIDC clients.",
        },
      },
    )
    .get(
      "/.well-known/openid-configuration",
      async ({ request, set }) => {
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
      },
      {
        detail: {
          tags: ["Auth"],
          summary: "Get OpenID Connect discovery metadata",
          description:
            "Returns OpenID Connect discovery metadata for the Solace mail OAuth issuer when mail OAuth is enabled.",
        },
      },
    )
    .get(
      `${localAuthBasePath}/.well-known/openid-configuration`,
      async ({ request, set }) => {
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
      },
      {
        detail: {
          tags: ["Auth"],
          summary: "Get OpenID Connect discovery metadata",
          description:
            "Returns OIDC discovery metadata on the issuer-relative path expected by external clients such as Stalwart.",
        },
      },
    )
    .use(errorHandler)
    .use(betterAuth)
    .get("/", () => ({ message: "API is running" }), {
      detail: {
        tags: ["Health"],
        summary: "API root status",
        description:
          "Simple root endpoint used to verify that the API process is reachable.",
      },
    })
    .get("/health", () => ({ status: "ok" }), {
      detail: {
        tags: ["Health"],
        summary: "Health check",
        description:
          "Lightweight liveness probe for uptime checks, deploy verification, and container health monitoring.",
      },
    })
    .get(
      "/me",
      async ({ request }) => {
        try {
          const session = await auth.api.getSession({
            headers: request.headers as Headers,
          });
          return session ? { user: session.user } : { user: null };
        } catch {
          return { user: null };
        }
      },
      {
        detail: {
          tags: ["Auth"],
          summary: "Get current session user",
          description:
            "Returns the authenticated user when a Better Auth session cookie is present. Returns a null user payload when no session is active.",
        },
      },
    )
    .get(
      "/user",
      async ({ request }) => {
        const session = await auth.api.getSession({
          headers: request.headers as Headers,
        });

        if (!session) {
          throw new UnauthorizedError();
        }

        return session.user;
      },
      {
        detail: {
          tags: ["Auth"],
          summary: "Require an authenticated user",
          description:
            "Returns the current user object and fails with 401 when the Better Auth session is missing or invalid.",
          security: sessionCookieAuthSecurity,
        },
      },
    )
    .get(
      "/test",
      () => ({
        message: "Backend connection working",
        timestamp: new Date().toISOString(),
      }),
      {
        detail: {
          tags: ["Health"],
          summary: "Backend connectivity test",
          description:
            "Debug endpoint for confirming request routing and current server time during integration checks.",
        },
      },
    )
    .use(e2eeRoutes)
    .use(eventsRoutes)
    .use(calendarSharingRoutes)
    .use(categoriesRoutes)
    .use(calendarsRoutes)
    .use(settingsRoutes)
    .use(notificationsRoutes)
    .use(recurringRoutes)
    .use(subscriptionsRoute)
    .use(mailRoutes)
    .use(mailAccountRoutes)
    .use(mailSyncRoutes)
    .use(realtimeMailRoutes)
    .use(accountPublicRoutes)
    .use(accountRoutes)
    .use(inviteRoutes);
};

// Start the server when this file is run directly
const port = env.port;
const app = createAPI("/api");
const calendarSyncService = CalendarSyncService.getInstance();

const shutdown = () => {
  calendarSyncService.stop();
  defaultMailRealtimeService.stop();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Handle OAuth errors at root (better-auth redirects here on error)
app.get("/", ({ query, redirect }) => {
  // If there's an OAuth error, redirect to frontend with error
  if (query.error) {
    return redirect(`${frontendUrl}/login?error=${query.error}`);
  }

  // Otherwise redirect to frontend
  return redirect(frontendUrl);
});

app.listen(port, () => {
  logger.ok(`Server is running on ${backendUrl}`);
  logger.info(`API documentation: ${backendUrl}/api/docs`);
  logger.info("Auth runtime config", {
    backendUrl,
    frontendUrl,
    cookieSameSite: process.env.AUTH_COOKIE_SAME_SITE || "lax",
    nodeEnv: process.env.NODE_ENV || "development",
  });
});
