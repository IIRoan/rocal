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
import { errorHandler } from "./lib/errors";
import { simpleNotificationService } from "./lib/simple-notification-service";

// Better Auth middleware following the documentation pattern
const betterAuth = new Elysia({ name: "better-auth" })
  .mount(auth.handler)
  .macro({
    auth: {
      async resolve({ status, request: { headers } }) {
        const session = await auth.api.getSession({
          headers,
        });

        if (!session) return status(401);

        return {
          user: session.user,
          session: session.session,
        };
      },
    },
  });

export const createAPI = (prefix = "") => {
  const app = new Elysia({ prefix });

  // Initialize Simple notification service
  simpleNotificationService.start();

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
      })
    );
  }

  return app
    .use(
      cors({
        origin: process.env.NEXT_PUBLIC_APP_URL,
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
      })
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
      }
    )
    .get("/user", ({ user }) => user, {
      auth: true,
      detail: {
        tags: ["Auth"],
        security: [{ bearerAuth: [] }],
      },
    })
    .get(
      "/test",
      () => ({
        message: "Backend connection working",
        timestamp: new Date().toISOString(),
      }),
      {
        detail: { tags: ["Health"] },
      }
    )
    .use(eventsRoutes)
    .use(categoriesRoutes)
    .use(calendarsRoutes)
    .use(settingsRoutes)
    .use(notificationsRoutes)
    .use(recurringRoutes);
};
