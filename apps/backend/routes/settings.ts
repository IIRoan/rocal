import { Elysia } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import { authenticatedRouteDetail } from "../lib/openapi";
import { prisma } from "../lib/prisma";
import { SettingsService } from "../services/settings.service";
import { RouteModel, routeModels } from "../contracts";

const settingsService = new SettingsService(prisma);

export const settingsRoutes = new Elysia({
  prefix: "/settings",
  normalize: false,
})
  .use(routeModels)
  .use(requireAuth)
  .guard(authenticatedRouteDetail("Settings"), (app) =>
    app
      .get("/", {
        detail: {
          summary: "Get user settings",
          description:
            "Fetches the authenticated user's settings, creating defaults if none exist",
        },
      }, async ({ routeUser }) => {
        return settingsService.get(routeUser.id);
      })

      .put("/", {
        body: RouteModel.settings.updateBody,
        detail: {
          summary: "Update user settings",
          description:
            "Updates the authenticated user's settings with validation",
        },
      }, async ({ body, routeUser }) => {
        return settingsService.update({
          userId: routeUser.id,
          ...body,
        });
      })

      .delete("/", {
        detail: {
          summary: "Reset user settings",
          description: "Resets user settings to defaults",
        },
      }, async ({ routeUser }) => {
        return settingsService.reset(routeUser.id);
      }),
  );
