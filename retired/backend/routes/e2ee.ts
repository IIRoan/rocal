import { Elysia } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import { authenticatedRouteDetail } from "../lib/openapi";
import { prisma } from "../lib/prisma";
import { E2eeService } from "../services/e2ee.service";
import { RouteModel, routeModels } from "../contracts";

const e2eeService = new E2eeService(prisma);

export const e2eeRoutes = new Elysia({
  prefix: "/e2ee",
  normalize: false,
})
  .use(routeModels)
  .use(requireAuth)
  .guard(authenticatedRouteDetail("E2EE"), (app) =>
    app
      .get("/bootstrap", {
        detail: {
          summary: "Get client encryption bootstrap state",
          description:
            "Returns device bootstrap records and current calendar shadow-write metadata for the authenticated user.",
        },
      }, async ({ routeUser }) => {
        return e2eeService.getBootstrap(routeUser.id);
      })
      .get("/reset-snapshot", {
        detail: {
          summary: "Get raw encrypted records for password reset",
          description:
            "Returns raw calendars, categories, and events so the client can refresh hybrid shadows before storing a new password envelope.",
        },
      }, async ({ routeUser }) => {
        return e2eeService.getResetSnapshot(routeUser.id);
      })
      .put("/device", {
        body: RouteModel.e2ee.deviceBody,
        detail: {
          summary: "Register or refresh a client encryption device",
          description:
            "Stores a client-owned wrapping public key and wrapped shadow-write keys for the authenticated device.",
        },
      }, async ({ body, routeUser }) => {
        return e2eeService.upsertDevice({
          userId: routeUser.id,
          ...body,
        });
      })
      .put("/password", {
        body: RouteModel.e2ee.passwordBody,
        detail: {
          summary: "Register or rotate a password-wrapped E2EE envelope",
          description:
            "Stores password-derived wrapping metadata and wrapped shadow-write keys for cross-device unlock.",
        },
      }, async ({ body, routeUser }) => {
        return e2eeService.upsertPasswordEnvelope({
          userId: routeUser.id,
          ...body,
        });
      }),
  );
