import { Elysia, t } from "elysia";
import { createLogger } from "@workspace/logger";
import { requireAuth } from "../lib/auth-guard";
import type { AuthenticatedUser } from "../lib/auth-utils";
import {
  type ApiErrorResponse,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../lib/errors";
import { authenticatedRouteDetail } from "../lib/openapi";
import { resolveRouteUser } from "../lib/request-user";
import { env } from "../lib/env";
import { resend, authEmailFrom } from "../lib/email-client";
import { buildInviteEmail, sendAuthEmail } from "../lib/auth-email";
import { strictObject } from "../lib/validation";
import { inviteService } from "../lib/invite-service";

const logger = createLogger("backend:invite-routes");

const createInviteBody = strictObject({
  email: t.String({ minLength: 1, maxLength: 320 }),
});

const revokeInviteParams = strictObject({
  id: t.String({ minLength: 1 }),
});

type RouteSet = {
  status?: number | string;
};

function buildInviteErrorResponse(
  statusCode: 400 | 403 | 404 | 409,
  error: string,
  message: string,
): ApiErrorResponse {
  return {
    error,
    message,
    statusCode,
    timestamp: new Date().toISOString(),
  };
}

function handleInviteRouteError(
  error: unknown,
  set: RouteSet,
): ApiErrorResponse | null {
  if (error instanceof ValidationError) {
    set.status = 400;
    return buildInviteErrorResponse(400, "Validation Error", error.message);
  }

  if (error instanceof ConflictError) {
    set.status = 409;
    return buildInviteErrorResponse(409, "Conflict", error.message);
  }

  if (error instanceof ForbiddenError) {
    set.status = 403;
    return buildInviteErrorResponse(403, "Forbidden", error.message);
  }

  if (error instanceof NotFoundError) {
    set.status = 404;
    return buildInviteErrorResponse(404, "Not Found", error.message);
  }

  return null;
}

export const inviteRoutes = new Elysia({
  prefix: "/invites",
  normalize: false,
})
  .use(requireAuth)
  .guard(authenticatedRouteDetail("Invites"), (app) =>
    app
      .post(
        "/",
        async ({
          authenticatedUser,
          request,
          body,
          set,
        }: {
          authenticatedUser?: AuthenticatedUser;
          request: Request;
          body: { email: string };
          set: RouteSet;
        }) => {
          try {
            const user = await resolveRouteUser(authenticatedUser, request);
            const invite = await inviteService.createInvite({
              invitedById: user.id,
              email: body.email,
            });

            const signupUrl = new URL(
              `/login?invite=${encodeURIComponent(invite.token)}`,
              env.frontendUrl.replace(/\/+$/, "") + "/",
            ).toString();

            const inviterName =
              (user.name as string | null | undefined)?.trim() || "Someone";

            await sendAuthEmail({
              client: resend,
              from: authEmailFrom,
              to: invite.email,
              label: "invite",
              message: buildInviteEmail({
                inviterName,
                signupUrl,
                token: invite.token,
              }),
              logger,
              isProduction: env.isProduction,
              mode: "best-effort",
              developmentFallbackContext: { signupUrl, token: invite.token },
            });

            return invite;
          } catch (error) {
            const handled = handleInviteRouteError(error, set);
            if (handled) {
              return handled;
            }

            logger.error("Failed to create invite", error);
            throw error;
          }
        },
        {
          body: createInviteBody,
          detail: {
            summary: "Create an invite",
            description: "Send an invite to an external email address.",
          },
        },
      )
      .get(
        "/",
        async ({
          authenticatedUser,
          request,
          set,
        }: {
          authenticatedUser?: AuthenticatedUser;
          request: Request;
          set: RouteSet;
        }) => {
          try {
            const user = await resolveRouteUser(authenticatedUser, request);
            return await inviteService.listInvites({ invitedById: user.id });
          } catch (error) {
            const handled = handleInviteRouteError(error, set);
            if (handled) {
              return handled;
            }

            logger.error("Failed to list invites", error);
            throw error;
          }
        },
        {
          detail: {
            summary: "List invites",
            description: "List all invites sent by the authenticated user.",
          },
        },
      )
      .delete(
        "/:id",
        async ({
          authenticatedUser,
          request,
          params,
          set,
        }: {
          authenticatedUser?: AuthenticatedUser;
          request: Request;
          params: { id: string };
          set: RouteSet;
        }) => {
          try {
            const user = await resolveRouteUser(authenticatedUser, request);
            return await inviteService.revokeInvite({
              id: params.id,
              invitedById: user.id,
            });
          } catch (error) {
            const handled = handleInviteRouteError(error, set);
            if (handled) {
              return handled;
            }

            logger.error("Failed to revoke invite", error);
            throw error;
          }
        },
        {
          params: revokeInviteParams,
          detail: {
            summary: "Revoke an invite",
            description: "Revoke a pending invite.",
          },
        },
      ),
  );
