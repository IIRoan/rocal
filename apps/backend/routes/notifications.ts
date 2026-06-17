import { Elysia } from "elysia";
import {
  ValidationError,
  NotFoundError,
} from "../lib/errors";
import { requireAuth } from "../lib/auth-guard";
import { authenticatedRouteDetail } from "../lib/openapi";
import { prisma } from "../lib/prisma";
import { NotificationService } from "../services/notification.service";
import { createLogger } from "@workspace/logger";
import { RouteModel, routeModels } from "../contracts";

const logger = createLogger("backend:notifications");
const notificationService = new NotificationService(prisma);

const RATE_LIMITS = {
  GET_NOTIFICATIONS: { requests: 100, windowMs: 60000 },
  UPDATE_NOTIFICATIONS: { requests: 20, windowMs: 60000 },
};

const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 60_000;
let lastRateLimitCleanup = 0;

function rateLimit(limit: { requests: number; windowMs: number }) {
  return ({
    request,
    set,
    routeUser,
    status,
  }: {
    request: Request;
    set: {
      status?: number | string;
      headers: Record<string, string | number | undefined>;
    };
    routeUser: { id: string };
    status: (code: number, body?: unknown) => unknown;
  }): unknown => {
    const key = `${routeUser.id}:${request.url}`;
    const now = Date.now();
    const windowStart = now - limit.windowMs;

    if (now - lastRateLimitCleanup > RATE_LIMIT_CLEANUP_INTERVAL_MS) {
      for (const [k, v] of rateLimitStore.entries()) {
        if (v.resetTime < now) rateLimitStore.delete(k);
      }
      lastRateLimitCleanup = now;
    }

    const current = rateLimitStore.get(key);
    if (!current || current.resetTime < windowStart) {
      rateLimitStore.set(key, { count: 1, resetTime: now + limit.windowMs });
      return;
    }

    if (current.count >= limit.requests) {
      set.headers["Retry-After"] = Math.ceil(
        (current.resetTime - now) / 1000,
      ).toString();
      return status(429, {
        error: "Validation Error",
        message: `Rate limit exceeded. Try again in ${Math.ceil((current.resetTime - now) / 1000)} seconds.`,
        statusCode: 429,
        timestamp: new Date().toISOString(),
      });
    }

    current.count++;
    return;
  };
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
        async ({ params, request, set, routeUser, status }) => {
          try {
            const limited = rateLimit(RATE_LIMITS.GET_NOTIFICATIONS)({
              request,
              set,
              routeUser,
              status,
            });
            if (limited) {
              return limited;
            }

            return await notificationService.getForEvent(
              routeUser.id,
              params.eventId,
            );
          } catch (error) {
            if (
              error instanceof ValidationError ||
              error instanceof NotFoundError
            ) {
              throw error;
            }
            logger.error("Failed to get event notifications:", error);
            throw new Error("Failed to retrieve event notifications");
          }
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
        async ({ params, body, request, set, routeUser, status }) => {
          try {
            const limited = rateLimit(RATE_LIMITS.UPDATE_NOTIFICATIONS)({
              request,
              set,
              routeUser,
              status,
            });
            if (limited) {
              return limited;
            }

            return await notificationService.setForEvent(
              routeUser.id,
              params.eventId,
              body.notifications,
            );
          } catch (error) {
            if (
              error instanceof ValidationError ||
              error instanceof NotFoundError
            ) {
              throw error;
            }
            logger.error("Failed to update event notifications:", error);
            throw new Error("Failed to update event notifications");
          }
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
        async ({ params, request, set, routeUser, status }) => {
          try {
            const limited = rateLimit(RATE_LIMITS.UPDATE_NOTIFICATIONS)({
              request,
              set,
              routeUser,
              status,
            });
            if (limited) {
              return limited;
            }

            return await notificationService.deleteForEvent(
              routeUser.id,
              params.eventId,
            );
          } catch (error) {
            if (
              error instanceof ValidationError ||
              error instanceof NotFoundError
            ) {
              throw error;
            }
            logger.error("Failed to delete event notifications:", error);
            throw new Error("Failed to delete event notifications");
          }
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
