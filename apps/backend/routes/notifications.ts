import { Elysia } from "elysia";
import { RateLimitError } from "../lib/errors";
import { enforceRateLimit } from "../lib/rate-limit";
import { requireAuth } from "../lib/auth-guard";
import { authenticatedRouteDetail } from "../lib/openapi";
import { prisma } from "../lib/prisma";
import { NotificationService } from "../services/notification.service";
import { RouteModel, routeModels } from "../contracts";

const notificationService = new NotificationService(prisma);

const RATE_LIMITS = {
  GET_NOTIFICATIONS: { requests: 100, windowMs: 60000 },
  UPDATE_NOTIFICATIONS: { requests: 20, windowMs: 60000 },
};

export const notificationsRoutes = new Elysia({
  prefix: "/notifications",
  normalize: false,
})
  .use(routeModels)
  .use(requireAuth)
  .guard(authenticatedRouteDetail("Notifications"), (app) =>
    app
      .get("/event/:eventId", {
        params: RouteModel.notifications.eventIdParams,
        detail: {
          summary: "Get notifications for an event",
          description:
            "Retrieves all notification settings for a specific event with enhanced validation and rate limiting",
        },
      }, async ({ params, request, routeUser }) => {
        enforceRateLimit({
          storeId: "notifications",
          key: `${routeUser.id}:${request.url}`,
          limit: RATE_LIMITS.GET_NOTIFICATIONS,
        });
      
        return notificationService.getForEvent(routeUser.id, params.eventId);
      })

      .put("/event/:eventId", {
        params: RouteModel.notifications.eventIdParams,
        body: RouteModel.notifications.updateBody,
        detail: {
          summary: "Update notifications for an event",
          description:
            "Updates all notification settings for a specific event using the enhanced notification service with comprehensive validation",
        },
      }, async ({ params, body, request, routeUser }) => {
        enforceRateLimit({
          storeId: "notifications",
          key: `${routeUser.id}:${request.url}`,
          limit: RATE_LIMITS.UPDATE_NOTIFICATIONS,
        });
      
        return notificationService.setForEvent(
          routeUser.id,
          params.eventId,
          body.notifications,
          body.displayTitle,
        );
      })

      .delete("/event/:eventId", {
        parse: "none",
        params: RouteModel.notifications.eventIdParams,
        detail: {
          summary: "Delete all notifications for an event",
          description:
            "Deletes all notification settings for a specific event using the enhanced notification service",
        },
      }, async ({ params, request, routeUser }) => {
        enforceRateLimit({
          storeId: "notifications",
          key: `${routeUser.id}:${request.url}`,
          limit: RATE_LIMITS.UPDATE_NOTIFICATIONS,
        });
      
        return notificationService.deleteForEvent(
          routeUser.id,
          params.eventId,
        );
      }),
  );
