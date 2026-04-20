import { Elysia } from "elysia";
import { auth } from "./auth";
import { UnauthorizedError } from "./errors";
import { hasUserId, type AuthenticatedUser } from "./auth-utils";

type AuthGuardContext = {
  request: Request;
  user?: AuthenticatedUser | null;
  session?: unknown;
};

type AuthGuardBeforeHandleContext = {
  user?: AuthenticatedUser | null;
};

// Auth guard plugin - preserve legacy user/session context and expose authenticatedUser for routes.
export const requireAuth = new Elysia({ name: "require-auth" })
  .derive(async (ctx: AuthGuardContext) => {
    if (hasUserId(ctx.user) && typeof ctx.user.id === "string") {
      return {
        user: ctx.user,
        session: ctx.session,
        authenticatedUser: ctx.user,
      };
    }

    try {
      const authData = await auth.api.getSession({
        headers: ctx.request.headers as Headers,
      });

      if (hasUserId(authData?.user) && typeof authData.user.id === "string") {
        return {
          user: authData.user,
          session: authData.session,
          authenticatedUser: authData.user,
        };
      }
    } catch {
      // Swallow auth provider errors and normalize them into UnauthorizedError.
    }

    return {
      user: null,
      session: null,
      authenticatedUser: null,
    };
  })
  .onBeforeHandle(({ user }: AuthGuardBeforeHandleContext) => {
    if (!user || typeof user !== "object" || !user.id) {
      throw new UnauthorizedError();
    }
  });
