import { Elysia } from "elysia";
import { RateLimitError } from "../lib/errors";
import { requireAuth } from "../lib/auth-guard";
import { authenticatedRouteDetail } from "../lib/openapi";
import { prisma } from "../lib/prisma";
import { PushDeviceService } from "../services/push-device.service";
import { RouteModel, routeModels } from "../contracts";

const pushDeviceService = new PushDeviceService(prisma);

const RATE_LIMITS = {
  REGISTER: { requests: 30, windowMs: 60_000 },
  UNREGISTER: { requests: 30, windowMs: 60_000 },
  TEST: { requests: 5, windowMs: 60_000 },
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

export const pushDeviceRoutes = new Elysia({
  prefix: "/push",
  normalize: false,
})
  .use(routeModels)
  .use(requireAuth)
  .guard(authenticatedRouteDetail("Push"), (app) =>
    app
      .put(
        "/devices",
        async ({ body, request, routeUser }) => {
          enforceRateLimit(`${routeUser.id}:${request.url}`, RATE_LIMITS.REGISTER);
          return pushDeviceService.register({
            userId: routeUser.id,
            ...body,
          });
        },
        {
          body: RouteModel.push.registerBody,
          detail: {
            summary: "Register an iOS push device",
            description:
              "Stores or refreshes the authenticated user's APNs device token. Tokens are treated as secrets and never logged.",
          },
        },
      )
      .delete(
        "/devices",
        async ({ body, request, routeUser }) => {
          enforceRateLimit(
            `${routeUser.id}:${request.url}`,
            RATE_LIMITS.UNREGISTER,
          );
          return pushDeviceService.unregister({
            userId: routeUser.id,
            ...body,
          });
        },
        {
          body: RouteModel.push.unregisterBody,
          detail: {
            summary: "Unregister a push device",
            description:
              "Deletes the given APNs token for the authenticated user, or all of the user's devices when no token is provided.",
          },
        },
      )
      .post(
        "/test",
        async ({ request, routeUser }) => {
          enforceRateLimit(`${routeUser.id}:${request.url}`, RATE_LIMITS.TEST);
          return pushDeviceService.enqueueTest({ userId: routeUser.id });
        },
        {
          detail: {
            summary: "Queue a test lock-screen notification",
            description:
              "Enqueues a metadata-only event reminder push for the authenticated user's registered iPhone devices.",
          },
        },
      ),
  );
