import { Elysia, t } from "elysia";
import {
  ValidationError,
  UnauthorizedError,
  NotFoundError,
} from "../lib/errors";
import { requireAuth } from "../lib/auth-guard";
import type { AuthenticatedUser } from "../lib/auth-utils";
import { authenticatedRouteDetail } from "../lib/openapi";
import { resolveRouteUser } from "../lib/request-user";
import { strictObject } from "../lib/validation";
import { prisma } from "../lib/prisma";
import { NotificationService } from "../services/notification.service";
import { createLogger } from "@workspace/logger";

const logger = createLogger("backend:notifications");
const notificationService = new NotificationService(prisma);

// Rate limiting configuration
const RATE_LIMITS = {
  GET_NOTIFICATIONS: { requests: 100, windowMs: 60000 },
  UPDATE_NOTIFICATIONS: { requests: 20, windowMs: 60000 },
};

const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 60_000;
let lastRateLimitCleanup = 0;

type RateLimitContext = {
  request: Request;
  set: {
    status?: number | string;
    headers: Record<string, string | number | undefined>;
  };
  user?: { id: string } | null;
};

function rateLimit(limit: { requests: number; windowMs: number }) {
  return ({ request, set, user }: RateLimitContext) => {
    if (!user) {
      set.status = 401;
      throw new UnauthorizedError("Authentication required");
    }

    const key = `${user.id}:${request.url}`;
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
      set.status = 429;
      set.headers["Retry-After"] = Math.ceil(
        (current.resetTime - now) / 1000,
      ).toString();
      throw new ValidationError(
        `Rate limit exceeded. Try again in ${Math.ceil((current.resetTime - now) / 1000)} seconds.`,
      );
    }

    current.count++;
  };
}

export const notificationsRoutes = new Elysia({
  prefix: "/notifications",
  normalize: false,
})
  .use(requireAuth)
  .guard(authenticatedRouteDetail("Notifications"), (app) =>
    app
      .get(
        "/event/:eventId",
        async ({
          params,
          request,
          set,
          authenticatedUser,
        }: {
          params: { eventId: string };
          request: Request;
          set: {
            status?: number | string;
            headers: Record<string, string | number | undefined>;
          };
          authenticatedUser?: AuthenticatedUser;
        }) => {
          try {
            const user = await resolveRouteUser(authenticatedUser, request);
            rateLimit(RATE_LIMITS.GET_NOTIFICATIONS)({
              request,
              set,
              user,
            });

            return await notificationService.getForEvent(
              user.id,
              params.eventId,
            );
          } catch (error) {
            if (
              error instanceof ValidationError ||
              error instanceof UnauthorizedError ||
              error instanceof NotFoundError
            ) {
              throw error;
            }
            logger.error("Failed to get event notifications:", error);
            throw new Error("Failed to retrieve event notifications");
          }
        },
        {
          params: strictObject({
            eventId: t.String({
              description: "Event ID to get notifications for",
              minLength: 1,
            }),
          }),
          detail: {
            summary: "Get notifications for an event",
            description:
              "Retrieves all notification settings for a specific event with enhanced validation and rate limiting",
          },
        },
      )

      .put(
        "/event/:eventId",
        async ({
          params,
          body,
          request,
          set,
          authenticatedUser,
        }: {
          params: { eventId: string };
          body: {
            notifications: Array<{
              notificationType: "browser" | "email";
              minutesBefore: number;
              isEnabled: boolean;
            }>;
          };
          request: Request;
          set: {
            status?: number | string;
            headers: Record<string, string | number | undefined>;
          };
          authenticatedUser?: AuthenticatedUser;
        }) => {
          try {
            const user = await resolveRouteUser(authenticatedUser, request);
            rateLimit(RATE_LIMITS.UPDATE_NOTIFICATIONS)({
              request,
              set,
              user,
            });

            return await notificationService.setForEvent(
              user.id,
              params.eventId,
              body.notifications,
            );
          } catch (error) {
            if (
              error instanceof ValidationError ||
              error instanceof UnauthorizedError ||
              error instanceof NotFoundError
            ) {
              throw error;
            }
            logger.error("Failed to update event notifications:", error);
            throw new Error("Failed to update event notifications");
          }
        },
        {
          params: strictObject({
            eventId: t.String({
              description: "Event ID to update notifications for",
              minLength: 1,
            }),
          }),
          body: strictObject({
            notifications: t.Array(
              strictObject({
                notificationType: t.Union(
                  [t.Literal("browser"), t.Literal("email")],
                  { description: "Type of notification" },
                ),
                minutesBefore: t.Integer({
                  description: "Minutes before event to send notification",
                  minimum: 0,
                  maximum: 43200,
                }),
                isEnabled: t.Boolean({
                  description: "Whether this notification is enabled",
                }),
              }),
              {
                description: "Array of notification settings",
                maxItems: 20,
              },
            ),
          }),
          detail: {
            summary: "Update notifications for an event",
            description:
              "Updates all notification settings for a specific event using the enhanced notification service with comprehensive validation",
          },
        },
      )

      .delete(
        "/event/:eventId",
        async ({
          params,
          request,
          set,
          authenticatedUser,
        }: {
          params: { eventId: string };
          request: Request;
          set: {
            status?: number | string;
            headers: Record<string, string | number | undefined>;
          };
          authenticatedUser?: AuthenticatedUser;
        }) => {
          try {
            const user = await resolveRouteUser(authenticatedUser, request);
            rateLimit(RATE_LIMITS.UPDATE_NOTIFICATIONS)({
              request,
              set,
              user,
            });

            return await notificationService.deleteForEvent(
              user.id,
              params.eventId,
            );
          } catch (error) {
            if (
              error instanceof ValidationError ||
              error instanceof UnauthorizedError ||
              error instanceof NotFoundError
            ) {
              throw error;
            }
            logger.error("Failed to delete event notifications:", error);
            throw new Error("Failed to delete event notifications");
          }
        },
        {
          params: strictObject({
            eventId: t.String({
              description: "Event ID to delete notifications for",
              minLength: 1,
            }),
          }),
          detail: {
            summary: "Delete all notifications for an event",
            description:
              "Deletes all notification settings for a specific event using the enhanced notification service",
          },
        },
      ),
  );
