import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { auth } from "./lib/auth";

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
      cors({
        origin: "http://localhost:3000",
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
      }),
    )
    .use(betterAuth)
    .get("/", () => ({ message: "API is running" }))
    .get("/health", () => ({ status: "ok" }))
    .get("/me", async ({ request }) => {
      try {
        const session = await auth.api.getSession({
          headers: request.headers as Headers,
        });
        return session ? { user: session.user } : { user: null };
      } catch {
        return { user: null };
      }
    })
    .get("/user", ({ user }) => user, {
      auth: true,
    })
    .get("/test", () => ({
      message: "Backend connection working",
      timestamp: new Date().toISOString(),
    }));

// For standalone development
if (import.meta.main) {
  const app = createAPI().listen(8080);
  console.log(`🚀 Backend server running at http://localhost:8080`);
}
