import { Elysia } from "elysia";
import { auth } from "./auth";
import { UnauthorizedError } from "./errors";

// Auth guard plugin - ensure authenticated user/session exist before handlers run
// Auth guard plugin - ensure authenticated user/session exist before handlers run
export const requireAuth = new Elysia({ name: "require-auth" })
  .derive(async (ctx: any) => {
    // 1. If user is already strictly valid from betterAuth, use it
    if (ctx.user?.id) {
      return { user: ctx.user, session: ctx.session };
    }

    // 2. Otherwise, attempt to fetch session explicitly (fallback mechanism)
    try {
      const authData = await auth.api.getSession({
        headers: ctx.request.headers as Headers,
      });

      if (authData?.user?.id) {
        return {
          user: authData.user,
          session: authData.session,
        };
      }
    } catch (error) {
      // console.error("AuthGuard: Session fetch failed", error);
    }

    // 3. Return explicit nulls so onBeforeHandle can catch it
    return { user: null, session: null };
  })
  .onBeforeHandle(({ user }: any) => {
    // Strictly enforce that user exists and has an ID
    if (!user || typeof user !== "object" || !user.id) {
      throw new UnauthorizedError();
    }
  });
