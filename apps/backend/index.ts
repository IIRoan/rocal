import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { auth } from "./lib/auth";
import { eventsRoutes } from "./routes/events";
import { categoriesRoutes } from "./routes/categories";
import { calendarsRoutes } from "./routes/calendars";
import { settingsRoutes } from "./routes/settings";
import { notificationsRoutes } from "./routes/notifications";
import { recurringRoutes } from "./routes/recurring";
import { subscriptionsRoute } from "./routes/subscriptions";
import { calendarAssistantRoute } from "./routes/calendar-assistant";
import { errorHandler, UnauthorizedError } from "./lib/errors";
import { CalendarSyncService } from "./lib/calendar-sync-service";

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
      console.error("Auth Middleware Error:", error);
      return {
        user: null,
        session: null,
      };
    }
  });

export const createAPI = (prefix = "") => {
  const app = new Elysia({ prefix });

  // Initialize Calendar sync service
  const calendarSyncService = CalendarSyncService.getInstance();
  calendarSyncService.start();

  // Only add Swagger in development
  if (process.env.NODE_ENV !== "production") {
    app.use(
      swagger({
        documentation: {
          info: {
            title: "Rocani API",
            version: "1.0.0",
            description: "Calendar and event management API",
          },
          tags: [
            { name: "Health", description: "Health check endpoints" },
            { name: "Auth", description: "Authentication endpoints" },
            { name: "Events", description: "Event management endpoints" },
            { name: "Categories", description: "Event category endpoints" },
            { name: "Calendars", description: "Calendar management endpoints" },
            { name: "Settings", description: "User settings endpoints" },
            {
              name: "Notifications",
              description: "Notification system endpoints",
            },
            { name: "Recurring", description: "Recurring events endpoints" },
            {
              name: "Calendar Subscriptions",
              description: "External calendar subscription endpoints",
            },
          ],
          components: {
            securitySchemes: {
              bearerAuth: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "JWT",
              },
            },
          },
        },
      }),
    );
  }

  return app
    .use(
      cors({
        origin:
          process.env.FRONTEND_URL ||
          process.env.NEXT_PUBLIC_APP_URL ||
          "http://localhost:4000",
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
      detail: { tags: ["Health"] },
    })
    .get("/health", () => ({ status: "ok" }), {
      detail: { tags: ["Health"] },
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
        detail: { tags: ["Auth"] },
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
          security: [{ bearerAuth: [] }],
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
        detail: { tags: ["Health"] },
      },
    )
    .use(eventsRoutes)
    .use(categoriesRoutes)
    .use(calendarsRoutes)
    .use(settingsRoutes)
    .use(notificationsRoutes)
    .use(recurringRoutes)
    .use(subscriptionsRoute)
    .use(calendarAssistantRoute);
};

// Start the server when this file is run directly
const port = process.env.PORT ? parseInt(process.env.PORT) : 4001;
const app = createAPI("/api");

// Handle OAuth errors at root (better-auth redirects here on error)
app.get("/", ({ query, redirect }) => {
  const frontendUrl =
    process.env.FRONTEND_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:4000";

  // If there's an OAuth error, redirect to frontend with error
  if (query.error) {
    return redirect(`${frontendUrl}/login?error=${query.error}`);
  }

  // Otherwise redirect to frontend
  return redirect(frontendUrl);
});

app.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
  console.log(`📝 API documentation: http://localhost:${port}/api/swagger`);
});
