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

type AuthenticatedSession = {
  user: AuthenticatedUser;
  sessionId: string;
};

async function resolveAuthenticatedSession(
  ctx: AuthParentContext,
): Promise<AuthenticatedSession | null> {
  try {
    const authData = await auth.api.getSession({
      headers: ctx.request.headers as Headers,
    });

    if (
      hasUserId(authData?.user) &&
      typeof authData.user.id === "string" &&
      typeof authData.session?.id === "string"
    ) {
      return {
        user: authData.user,
        sessionId: authData.session.id,
      };
    }
  } catch (error) {
    logger.debug("Session resolution failed", errorLogDetails(error));
  }

  if (
    hasUserId(ctx.authenticatedUser) &&
    typeof ctx.authenticatedUser.id === "string"
  ) {
    return {
      user: ctx.authenticatedUser,
      sessionId: "",
    };
  }

  if (hasUserId(ctx.user) && typeof ctx.user.id === "string") {
    return {
      user: ctx.user,
      sessionId: "",
    };
  }

  return null;
}

// Auth guard plugin — resolves `routeUser` for authenticated routes.
export const requireAuth = new Elysia({ name: "require-auth" }).derive(
  "plugin",
  async (ctx) => {
    const parent = ctx as typeof ctx & AuthParentContext;
    const session = await resolveAuthenticatedSession(parent);

    if (!session?.user?.id) {
      return status(401, unauthorizedBody());
    }

    const { user: routeUser, sessionId } = session;
    const stepUpVerified =
      sessionId.length > 0 &&
      hasVerifiedPasskeyStepUp(parent.request, {
        userId: routeUser.id,
        sessionId,
      });

    if (!stepUpVerified) {
      const stepUpStatus = await getPasskeyStepUpStatus({
        prisma,
        request: parent.request,
        userId: routeUser.id,
        sessionId,
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
