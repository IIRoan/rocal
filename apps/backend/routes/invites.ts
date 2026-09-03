import { Elysia } from "elysia";
import { createLogger } from "@workspace/logger";
import { requireAuth } from "../lib/auth-guard";
import {
  type ApiErrorResponse,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../lib/errors";
import { authenticatedRouteDetail } from "../lib/openapi";
import { env } from "../lib/env";
import { mailer, authEmailFrom } from "../lib/email-client";
import { buildInviteEmail, sendAuthEmail } from "../lib/auth-email";
import { emailDeliveryWarning } from "../lib/email-delivery";
import { errorLogDetails } from "../lib/log-sanitization";
import { resolveRequestId } from "../lib/request-context";
import { inviteService } from "../lib/invite-service";
import { RouteModel, routeModels } from "../contracts";

const logger = createLogger("backend:invite-routes");

type RouteSet = {
  status?: number | string;
};

function buildInviteErrorResponse(
  statusCode: 400 | 403 | 404 | 409,
  error: string,
  message: string,
  requestId: string,
): ApiErrorResponse {
  return {
    error,
    message,
    statusCode,
    requestId,
    timestamp: new Date().toISOString(),
  };
}

function handleInviteRouteError(
  error: unknown,
  set: RouteSet,
  request: Request,
): ApiErrorResponse | null {
  const requestId = resolveRequestId(request);

  if (error instanceof ValidationError) {
    set.status = 400;
    return buildInviteErrorResponse(400, "Validation Error", error.message, requestId);
  }

  if (error instanceof ConflictError) {
    set.status = 409;
    return buildInviteErrorResponse(409, "Conflict", error.message, requestId);
  }

  if (error instanceof ForbiddenError) {
    set.status = 403;
    return buildInviteErrorResponse(403, "Forbidden", error.message, requestId);
  }

  if (error instanceof NotFoundError) {
    set.status = 404;
    return buildInviteErrorResponse(404, "Not Found", error.message, requestId);
  }

  return null;
}

export const inviteRoutes = new Elysia({
  prefix: "/invites",
  normalize: false,
})
  .use(routeModels)
  .use(requireAuth)
  .guard(authenticatedRouteDetail("Invites"), (app) =>
    app
      .post("/", {
        body: RouteModel.invite.createBody,
        detail: {
          summary: "Create an invite",
          description: "Send an invite to an external email address.",
        },
      }, async ({ routeUser, body, set, request }) => {
        try {
          const invite = await inviteService.createInvite({
            invitedById: routeUser.id,
            email: body.email,
          });
      
          const signupUrl = new URL(
            `/login?invite=${encodeURIComponent(invite.token)}`,
            env.frontendUrl.replace(/\/+$/, "") + "/",
          ).toString();
      
          const inviterName =
            (routeUser.name as string | null | undefined)?.trim() || "Someone";
      
          const delivery = await sendAuthEmail({
            client: mailer,
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
      
          const warnings = delivery.delivered
            ? []
            : [emailDeliveryWarning("invite", invite.email)];
      
          return {
            ...invite,
            ...(warnings.length > 0 ? { warnings } : {}),
          };
        } catch (error) {
          const handled = handleInviteRouteError(error, set, request);
          if (handled) {
            return handled;
          }
      
          logger.error("Failed to create invite", errorLogDetails(error));
          throw error;
        }
      })
      .get("/", {
        detail: {
          summary: "List invites",
          description: "List all invites sent by the authenticated user.",
        },
      }, async ({ routeUser, set, request }) => {
        try {
          return await inviteService.listInvites({ invitedById: routeUser.id });
        } catch (error) {
          const handled = handleInviteRouteError(error, set, request);
          if (handled) {
            return handled;
          }
      
          logger.error("Failed to list invites", errorLogDetails(error));
          throw error;
        }
      })
      .delete("/:id", {
        parse: "none",
        params: RouteModel.invite.revokeParams,
        detail: {
          summary: "Revoke an invite",
          description: "Revoke a pending invite.",
        },
      }, async ({ routeUser, params, set, request }) => {
        try {
          return await inviteService.revokeInvite({
            id: params.id,
            invitedById: routeUser.id,
          });
        } catch (error) {
          const handled = handleInviteRouteError(error, set, request);
          if (handled) {
            return handled;
          }
      
          logger.error("Failed to revoke invite", errorLogDetails(error));
          throw error;
        }
      }),
  );
