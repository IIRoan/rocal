import {
  ensureAuthenticatedUser,
  type AuthenticatedUser,
} from "./auth-utils";

export async function resolveRouteUser(
  authenticatedUser: AuthenticatedUser | null | undefined,
  request: Request,
): Promise<AuthenticatedUser> {
  if (authenticatedUser?.id) {
    return authenticatedUser;
  }

  return ensureAuthenticatedUser(undefined, request);
}
