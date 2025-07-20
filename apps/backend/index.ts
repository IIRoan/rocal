import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { auth } from "./lib/auth";
import { eventsRoutes } from "./routes/events";
import { categoriesRoutes } from "./routes/categories";
import { errorHandler } from "./lib/errors";

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

export const createAPI = (prefix = "") =>
  new Elysia({ prefix })
    .use(
      swagger({
        documentation: {
          info: {
            title: "Rocani API",
            version: "1.0.0",
            description: "Calendar and event management API"
          },
          tags: [
            { name: "Health", description: "Health check endpoints" },
            { name: "Auth", description: "Authentication endpoints" },
            { name: "Events", description: "Event management endpoints" },
            { name: "Categories", description: "Event category endpoints" }
          ],
          components: {
            securitySchemes: {
              bearerAuth: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "JWT"
              }
            }
          }
        }
      })
    )
    .use(
      cors({
        origin: "http://localhost:3000",
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
      })
    )
    .use(errorHandler)
    .use(betterAuth)
    .get("/", () => ({ message: "API is running" }), {
      detail: { tags: ["Health"] }
    })
    .get("/health", () => ({ status: "ok" }), {
      detail: { tags: ["Health"] }
    })
    .get("/me", async ({ request }) => {
      try {
        const session = await auth.api.getSession({
          headers: request.headers as Headers,
        });
        return session ? { user: session.user } : { user: null };
      } catch {
        return { user: null };
      }
    }, {
      detail: { tags: ["Auth"] }
    })
    .get("/user", ({ user }) => user, {
      auth: true,
      detail: { 
        tags: ["Auth"],
        security: [{ bearerAuth: [] }]
      }
    })
    .get("/test", () => ({
      message: "Backend connection working",
      timestamp: new Date().toISOString(),
    }), {
      detail: { tags: ["Health"] }
    })
    .use(eventsRoutes)
    .use(categoriesRoutes);

// For standalone development
if (import.meta.main) {
  const app = createAPI().listen(8080);
  console.log(`🚀 Backend server running at http://localhost:8080`);
}
