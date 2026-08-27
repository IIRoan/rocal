import { Elysia } from "elysia";
import { createLogger } from "@workspace/logger";
import { auth } from "./auth";
import { errorLogDetails } from "./log-sanitization";

const logger = createLogger("backend:auth");

export function handleBetterAuthRequest(request: Request) {
  return auth.handler(request);
}

/**
 * Better Auth as native Elysia routes (not `.mount()`).
 * Elysia 2 AOT cannot compile mounted sub-apps.
 */
export function createBetterAuthPlugin(localAuthBasePath: string) {
  return new Elysia({ name: "better-auth" })
    .all(localAuthBasePath, ({ request }) => handleBetterAuthRequest(request))
    .all(`${localAuthBasePath}/`, ({ request }) =>
      handleBetterAuthRequest(request),
    )
    .all(`${localAuthBasePath}/*`, ({ request }) =>
      handleBetterAuthRequest(request),
    )
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
        logger.error("Auth middleware error", errorLogDetails(error));
        return {
          user: null,
          session: null,
        };
      }
    });
}
