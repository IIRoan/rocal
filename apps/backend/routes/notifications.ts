import { Elysia, t } from "elysia";
import {
  ValidationError,
  UnauthorizedError,
  NotFoundError,
} from "../lib/errors";
import { requireAuth } from "../lib/auth-guard";
import { ensureAuthenticatedUser } from "../lib/auth-utils";
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

    for (const [k, v] of rateLimitStore.entries()) {
      if (v.resetTime < windowStart) rateLimitStore.delete(k);
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
  .get(
    "/event/:eventId",
    async ({ params, user, request, set }: { params: { eventId: string }; user?: unknown; request: Request; set: { status?: number | string; headers: Record<string, string | number | undefined> } }) => {
      const authenticatedUser = await ensureAuthenticatedUser(user, request);

      try {
        rateLimit(RATE_LIMITS.GET_NOTIFICATIONS)({
          request,
          set,
          user: authenticatedUser,
        });

        return await notificationService.getForEvent(
          authenticatedUser.id,
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
        tags: ["Notifications"],
        summary: "Get notifications for an event",
        description:
          "Retrieves all notification settings for a specific event with enhanced validation and rate limiting",
        security: [{ bearerAuth: [] }],
      },
    },
  )

  .put(
    "/event/:eventId",
    async ({ params, body, user, request, set }: { params: { eventId: string }; body: { notifications: Array<{ notificationType: "browser" | "email"; minutesBefore: number; isEnabled: boolean }> }; user?: unknown; request: Request; set: { status?: number | string; headers: Record<string, string | number | undefined> } }) => {
      const authenticatedUser = await ensureAuthenticatedUser(user, request);

      try {
        rateLimit(RATE_LIMITS.UPDATE_NOTIFICATIONS)({
          request,
          set,
          user: authenticatedUser,
        });

        return await notificationService.setForEvent(
          authenticatedUser.id,
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
        tags: ["Notifications"],
        summary: "Update notifications for an event",
        description:
          "Updates all notification settings for a specific event using the enhanced notification service with comprehensive validation",
        security: [{ bearerAuth: [] }],
      },
    },
  )

  .delete(
    "/event/:eventId",
    async ({ params, user, request, set }: { params: { eventId: string }; user?: unknown; request: Request; set: { status?: number | string; headers: Record<string, string | number | undefined> } }) => {
      const authenticatedUser = await ensureAuthenticatedUser(user, request);

      try {
        rateLimit(RATE_LIMITS.UPDATE_NOTIFICATIONS)({
          request,
          set,
          user: authenticatedUser,
        });

        return await notificationService.deleteForEvent(
          authenticatedUser.id,
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
        tags: ["Notifications"],
        summary: "Delete all notifications for an event",
        description:
          "Deletes all notification settings for a specific event using the enhanced notification service",
        security: [{ bearerAuth: [] }],
      },
    },
  );
