import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { createLogger, installGlobalConsoleLogger } from "@workspace/logger";
import {
  auth,
  BETTER_AUTH_BASE_PATH,
  getAuthOpenApiDocumentation,
} from "./lib/auth";
import { env, parseCsvEnv } from "./lib/env";
import { e2eeRoutes } from "./routes/e2ee";
import { eventsRoutes } from "./routes/events";
import { categoriesRoutes } from "./routes/categories";
import { calendarsRoutes } from "./routes/calendars";
import { settingsRoutes } from "./routes/settings";
import { notificationsRoutes } from "./routes/notifications";
import { recurringRoutes } from "./routes/recurring";
import { subscriptionsRoute } from "./routes/subscriptions";
import { calendarSharingRoutes } from "./routes/calendar-sharing";
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

installGlobalConsoleLogger("backend");

const logger = createLogger("backend");

const { frontendUrl } = env;

const corsOrigins = Array.from(
  new Set([
    frontendUrl,
    process.env.NEXT_PUBLIC_APP_URL || "",
    "http://localhost",
    "https://localhost",
    ...parseCsvEnv(process.env.TRUSTED_ORIGINS),
  ]),
).filter(Boolean);

function normalizePath(path: string) {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
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

const apiDocumentation = await buildApiDocumentation();

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
  const docsUiPath = normalizePath(`${prefix}${API_DOCS_UI_PATH}` || API_DOCS_UI_PATH);
  const docsSpecPath = normalizePath(
    `${prefix}${API_DOCS_SPEC_PATH}` || API_DOCS_SPEC_PATH,
  );
  const authOpenApiSchemaPath = normalizePath(
    `${prefix}${BETTER_AUTH_BASE_PATH}/open-api/generate-schema`,
  );

  // Initialize Calendar sync service
  const calendarSyncService = CalendarSyncService.getInstance();
  calendarSyncService.start();

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

  return app
    .use(
      cors({
        origin: corsOrigins,
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
    .use(subscriptionsRoute);
};

// Start the server when this file is run directly
const port = env.port;
const app = createAPI("/api");
const calendarSyncService = CalendarSyncService.getInstance();

const shutdown = () => {
  calendarSyncService.stop();
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
  logger.ok(`Server is running on http://localhost:${port}`);
  logger.info(`API documentation: http://localhost:${port}/api/docs`);
  logger.info("Auth runtime config", {
    frontendUrl,
    authRedirectUrl: process.env.AUTH_REDIRECT_URL || null,
    mobileAuthCallbackUrl: process.env.MOBILE_AUTH_CALLBACK_URL || null,
    cookieSameSite: process.env.AUTH_COOKIE_SAME_SITE || "lax",
    nodeEnv: process.env.NODE_ENV || "development",
  });
});
