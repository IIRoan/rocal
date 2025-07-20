import { Elysia } from "elysia"
import { cors } from "@elysiajs/cors"
import { auth } from "./lib/auth"

export const createAPI = (prefix = "") => 
  new Elysia({ prefix })
    .use(cors({
      origin: "http://localhost:3000",
      credentials: true,
    }))
    .mount("/auth", auth.handler)
    .get("/", () => ({ message: "API is running" }))
    .get("/health", () => ({ status: "ok" }))
    .get("/me", async ({ request }) => {
      try {
        const session = await auth.api.getSession({
          headers: request.headers as Headers
        })
        return session ? { user: session.user } : { user: null }
      } catch {
        return { user: null }
      }
    })
    .get("/protected", async ({ request }) => {
      try {
        const session = await auth.api.getSession({
          headers: request.headers as Headers
        })
        if (!session) {
          return { error: "Unauthorized" }
        }
        return { message: "This is a protected route", user: session.user }
      } catch {
        return { error: "Unauthorized" }
      }
    })

// For standalone development
if (import.meta.main) {
  const app = createAPI().listen(8080)
  console.log(`🚀 Backend server running at http://localhost:8080`)
}