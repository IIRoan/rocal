import { Elysia } from "elysia";
import { RateLimitError } from "../lib/errors";
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

const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 60_000;
let lastRateLimitCleanup = 0;

function enforceRateLimit(
  key: string,
  limit: { requests: number; windowMs: number },
) {
  const now = Date.now();
  const windowStart = now - limit.windowMs;

  if (now - lastRateLimitCleanup > RATE_LIMIT_CLEANUP_INTERVAL_MS) {
    for (const [storedKey, value] of rateLimitStore.entries()) {
      if (value.resetTime < now) rateLimitStore.delete(storedKey);
    }
    lastRateLimitCleanup = now;
  }

  const current = rateLimitStore.get(key);
  if (!current || current.resetTime < windowStart) {
    rateLimitStore.set(key, { count: 1, resetTime: now + limit.windowMs });
    return;
  }

  if (current.count >= limit.requests) {
    const retryAfterSeconds = Math.ceil((current.resetTime - now) / 1000);
    throw new RateLimitError(
      `Rate limit exceeded. Try again in ${retryAfterSeconds} seconds.`,
      retryAfterSeconds,
    );
  }

  current.count++;
}

export const notificationsRoutes = new Elysia({
  prefix: "/notifications",
  normalize: false,
})
  .use(routeModels)
  .use(requireAuth)
  .guard(authenticatedRouteDetail("Notifications"), (app) =>
    app
      .get(
        "/event/:eventId",
        async ({ params, request, routeUser }) => {
          enforceRateLimit(
            `${routeUser.id}:${request.url}`,
            RATE_LIMITS.GET_NOTIFICATIONS,
          );

          return notificationService.getForEvent(routeUser.id, params.eventId);
        },
        {
          params: RouteModel.notifications.eventIdParams,
          detail: {
            summary: "Get notifications for an event",
            description:
              "Retrieves all notification settings for a specific event with enhanced validation and rate limiting",
          },
        },
      )

      .put(
        "/event/:eventId",
        async ({ params, body, request, routeUser }) => {
          enforceRateLimit(
            `${routeUser.id}:${request.url}`,
            RATE_LIMITS.UPDATE_NOTIFICATIONS,
          );

          return notificationService.setForEvent(
            routeUser.id,
            params.eventId,
            body.notifications,
            body.displayTitle,
          );
        },
        {
          params: RouteModel.notifications.eventIdParams,
          body: RouteModel.notifications.updateBody,
          detail: {
            summary: "Update notifications for an event",
            description:
              "Updates all notification settings for a specific event using the enhanced notification service with comprehensive validation",
          },
        },
      )

      .delete(
        "/event/:eventId",
        async ({ params, request, routeUser }) => {
          enforceRateLimit(
            `${routeUser.id}:${request.url}`,
            RATE_LIMITS.UPDATE_NOTIFICATIONS,
          );

          return notificationService.deleteForEvent(
            routeUser.id,
            params.eventId,
          );
        },
        {
          params: RouteModel.notifications.eventIdParams,
          detail: {
            summary: "Delete all notifications for an event",
            description:
              "Deletes all notification settings for a specific event using the enhanced notification service",
          },
        },
      ),
  );
