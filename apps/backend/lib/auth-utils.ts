import { auth } from "./auth";

/**
 * Ensures that a user is authenticated and returns the user object.
 * If the user object is missing or incomplete in the context, it attempts to fetch the session from the request headers.
 * Throws an error if the user cannot be resolved.
 *
 * @param user The user object from the context
 * @param request The request object (for headers)
 * @returns The authenticated user object
 */
export async function ensureAuthenticatedUser(user: any, request: Request) {
  // 1. Fast path: User already valid
  if (user && user.id) {
    return user;
  }

  // 2. Fallback: Fetch session from auth
  try {
    const session = await auth.api.getSession({
      headers: request.headers as Headers,
    });

    if (session?.user?.id) {
      return session.user;
    }
  } catch (error) {
    console.error("ensureAuthenticatedUser: Session fallback failed", error);
  }

  // 3. Failure
  console.error(
    "ensureAuthenticatedUser: User context missing and fallback failed",
  );
  throw new Error("User context missing");
}
