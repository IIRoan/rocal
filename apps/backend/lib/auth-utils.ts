import { auth } from "./auth";
import { createLogger } from "@workspace/logger";
import { UnauthorizedError } from "./errors";

const logger = createLogger("backend:auth-utils");

export type AuthenticatedUser = {
  id: string;
  email?: string | null;
  name?: string | null;
} & Record<string, unknown>;

export function hasUserId(user: unknown): user is AuthenticatedUser {
  return !!user && typeof user === "object" && "id" in user;
}

/**
 * Ensures that a user is authenticated and returns the user object.
 * If the user object is missing or incomplete in the context, it attempts to fetch the session from the request headers.
 * Throws an error if the user cannot be resolved.
 *
 * @param user The user object from the context
 * @param request The request object (for headers)
 * @returns The authenticated user object
 */
export async function ensureAuthenticatedUser(
  user: unknown,
  request: Request,
): Promise<AuthenticatedUser> {
  // 1. Fast path: User already valid
  if (hasUserId(user) && typeof user.id === "string") {
    return user;
  }

  // 2. Fallback: Fetch session from auth
  try {
    const session = await auth.api.getSession({
      headers: request.headers as Headers,
    });

    if (hasUserId(session?.user) && typeof session.user.id === "string") {
      return session.user;
    }
  } catch (error) {
    logger.error("ensureAuthenticatedUser: Session fallback failed", error);
  }

  // 3. Failure
  logger.error(
    "ensureAuthenticatedUser: User context missing and fallback failed",
  );
  throw new UnauthorizedError("Authentication required.");
}
