import { Elysia } from "elysia";
import { auth } from "./auth";
import { ForbiddenError, UnauthorizedError } from "./errors";
import { hasUserId, type AuthenticatedUser } from "./auth-utils";
import { prisma } from "./prisma";
import {
  getPasskeyStepUpStatus,
  hasVerifiedPasskeyStepUp,
} from "./passkey-step-up";

type AuthGuardContext = {
  request: Request;
  authenticatedUser?: AuthenticatedUser | null;
  user?: AuthenticatedUser | null;
};

type AuthGuardBeforeHandleContext = {
  authenticatedUser?: AuthenticatedUser | null;
};

// Auth guard plugin - expose a normalized authenticatedUser for routes.
export const requireAuth = new Elysia({ name: "require-auth" })
  .derive(async (ctx: AuthGuardContext) => {
    if (
      hasUserId(ctx.authenticatedUser) &&
      typeof ctx.authenticatedUser.id === "string"
    ) {
      return {
        authenticatedUser: ctx.authenticatedUser,
      };
    }

    if (hasUserId(ctx.user) && typeof ctx.user.id === "string") {
      return {
        authenticatedUser: ctx.user,
      };
    }

    try {
      const authData = await auth.api.getSession({
        headers: ctx.request.headers as Headers,
      });

      if (hasUserId(authData?.user) && typeof authData.user.id === "string") {
        return {
          authenticatedUser: authData.user,
        };
      }
    } catch {
      // Swallow auth provider errors and normalize them into UnauthorizedError.
    }

    return {
      authenticatedUser: null,
    };
  })
  .onBeforeHandle(({ authenticatedUser }: AuthGuardBeforeHandleContext) => {
    if (
      !authenticatedUser ||
      typeof authenticatedUser !== "object" ||
      !authenticatedUser.id
    ) {
      throw new UnauthorizedError();
    }
  })
  .onBeforeHandle(async ({ request, authenticatedUser }: AuthGuardContext) => {
    if (
      !authenticatedUser ||
      typeof authenticatedUser !== "object" ||
      !authenticatedUser.id
    ) {
      return;
    }

    if (hasVerifiedPasskeyStepUp(request)) {
      return;
    }

    const stepUpStatus = await getPasskeyStepUpStatus({
      prisma,
      request,
      userId: authenticatedUser.id,
    });

    if (stepUpStatus.requiresPasskeyStepUp) {
      throw new ForbiddenError("Passkey verification required.");
    }
  });
