import { Elysia } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import { authenticatedRouteDetail } from "../lib/openapi";
import { enforceRateLimit } from "../lib/rate-limit";
import { prisma } from "../lib/prisma";
import { PushDeviceService } from "../services/push-device.service";
import { RouteModel, routeModels } from "../contracts";

const pushDeviceService = new PushDeviceService(prisma);

const RATE_LIMITS = {
  LIST: { requests: 60, windowMs: 60_000 },
  REGISTER: { requests: 30, windowMs: 60_000 },
  UNREGISTER: { requests: 30, windowMs: 60_000 },
  TEST: { requests: 5, windowMs: 60_000 },
};

export const pushDeviceRoutes = new Elysia({
  prefix: "/push",
  normalize: false,
})
  .use(routeModels)
  .use(requireAuth)
  .guard(authenticatedRouteDetail("Push"), (app) =>
    app
      .get("/devices", {
        detail: {
          summary: "List registered push devices",
          description:
            "Returns the authenticated user's enabled iOS devices that can receive lock-screen alerts. Device tokens are never included.",
        },
      }, async ({ request, routeUser }) => {
        enforceRateLimit({
          storeId: "push-devices",
          key: `${routeUser.id}:${request.url}`,
          limit: RATE_LIMITS.LIST,
        });
        return pushDeviceService.list({ userId: routeUser.id });
      })
      .put("/devices", {
        body: RouteModel.push.registerBody,
        detail: {
          summary: "Register an iOS push device",
          description:
            "Stores or refreshes the authenticated user's APNs device token. Tokens are treated as secrets and never logged.",
        },
      }, async ({ body, request, routeUser }) => {
        enforceRateLimit({
          storeId: "push-devices",
          key: `${routeUser.id}:${request.url}`,
          limit: RATE_LIMITS.REGISTER,
        });
        return pushDeviceService.register({
          userId: routeUser.id,
          ...body,
        });
      })
      .delete("/devices", {
        body: RouteModel.push.unregisterBody,
        detail: {
          summary: "Unregister a push device",
          description:
            "Deletes the given APNs token for the authenticated user, or all of the user's devices when no token is provided.",
        },
      }, async ({ body, request, routeUser }) => {
        enforceRateLimit({
          storeId: "push-devices",
          key: `${routeUser.id}:${request.url}`,
          limit: RATE_LIMITS.UNREGISTER,
        });
        return pushDeviceService.unregister({
          userId: routeUser.id,
          ...body,
        });
      })
      .post("/test", {
        detail: {
          summary: "Queue a test lock-screen notification",
          description:
            "Enqueues a metadata-only event reminder push for the authenticated user's registered iPhone devices.",
        },
      }, async ({ request, routeUser }) => {
        enforceRateLimit({
          storeId: "push-devices",
          key: `${routeUser.id}:${request.url}`,
          limit: RATE_LIMITS.TEST,
        });
        return pushDeviceService.enqueueTest({ userId: routeUser.id });
      }),
  );
