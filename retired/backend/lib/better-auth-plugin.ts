import { Elysia } from "elysia";
import { auth } from "./auth";

export function handleBetterAuthRequest(request: Request) {
  return auth.handler(request);
}

/** Better Auth as native Elysia routes — Elysia 2 AOT cannot compile mounted sub-apps. */
export function createBetterAuthPlugin(localAuthBasePath: string) {
  return new Elysia({ name: "better-auth" })
    .all(localAuthBasePath, ({ request }) => handleBetterAuthRequest(request))
    .all(`${localAuthBasePath}/`, ({ request }) =>
      handleBetterAuthRequest(request),
    )
    .all(`${localAuthBasePath}/*`, ({ request }) =>
      handleBetterAuthRequest(request),
    );
}
