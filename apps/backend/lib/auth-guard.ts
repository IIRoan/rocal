import { Elysia, status } from "elysia";
import { createLogger } from "@workspace/logger";
import { auth } from "./auth";
import {
  PASSKEY_STEP_UP_REQUIRED_CODE,
  PASSKEY_STEP_UP_REQUIRED_MESSAGE,
} from "@workspace/calendar-core";
import { forbiddenBody, unauthorizedBody } from "./api-error-response";
import { hasUserId, type AuthenticatedUser } from "./auth-utils";
import { errorLogDetails } from "./log-sanitization";
import { prisma } from "./prisma";
import {
  getPasskeyStepUpStatus,
  hasVerifiedPasskeyStepUp,
} from "./passkey-step-up";

const logger = createLogger("backend:auth-guard");

type AuthParentContext = {
  authenticatedUser?: AuthenticatedUser | null;
  user?: AuthenticatedUser | null;
  request: Request;
};

async function resolveAuthenticatedUser(
  ctx: AuthParentContext,
): Promise<AuthenticatedUser | null> {
  if (
    hasUserId(ctx.authenticatedUser) &&
    typeof ctx.authenticatedUser.id === "string"
  ) {
    return ctx.authenticatedUser;
  }

  if (hasUserId(ctx.user) && typeof ctx.user.id === "string") {
    return ctx.user;
  }

  try {
    const authData = await auth.api.getSession({
      headers: ctx.request.headers as Headers,
    });

    if (hasUserId(authData?.user) && typeof authData.user.id === "string") {
      return authData.user;
    }
  } catch (error) {
    logger.debug("Session resolution failed", errorLogDetails(error));
  }

  return null;
}

// Auth guard plugin — resolves `routeUser` for authenticated routes.
export const requireAuth = new Elysia({ name: "require-auth" }).derive(
  { as: "scoped" },
  async (ctx) => {
    const parent = ctx as typeof ctx & AuthParentContext;
    const routeUser = await resolveAuthenticatedUser(parent);

    if (!routeUser?.id) {
      return status(401, unauthorizedBody());
    }

    if (!hasVerifiedPasskeyStepUp(parent.request)) {
      const stepUpStatus = await getPasskeyStepUpStatus({
        prisma,
        request: parent.request,
        userId: routeUser.id,
      });

      if (stepUpStatus.requiresPasskeyStepUp) {
        return status(
          403,
          forbiddenBody(PASSKEY_STEP_UP_REQUIRED_MESSAGE, {
            code: PASSKEY_STEP_UP_REQUIRED_CODE,
          }),
        );
      }
    }

    return { routeUser };
  },
);
