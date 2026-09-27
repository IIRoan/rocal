import { Elysia } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import { authenticatedRouteDetail } from "../lib/openapi";
import { prisma } from "../lib/prisma";
import { MailSettingsService } from "../services/mail-settings.service";
import { RouteModel, routeModels } from "../contracts";

const mailSettingsService = new MailSettingsService(prisma);

export const mailSettingsRoutes = new Elysia({
  prefix: "/mail-settings",
  normalize: false,
})
  .use(routeModels)
  .use(requireAuth)
  .guard(authenticatedRouteDetail("Mail settings"), (app) =>
    app
      .get("/", {
        detail: {
          summary: "Get encrypted mail settings",
          description:
            "Fetches the authenticated user's encrypted mail-settings blob",
        },
      }, async ({ routeUser }) => {
        const record = await mailSettingsService.get(routeUser.id);
        if (!record) {
          return new Response(JSON.stringify(null), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return record;
      })
      .put("/", {
        body: RouteModel.mailSettings.putBody,
        detail: {
          summary: "Upsert encrypted mail settings",
          description:
            "Stores or updates the authenticated user's encrypted mail-settings blob",
        },
      }, async ({ body, routeUser }) => {
        return mailSettingsService.upsert({
          userId: routeUser.id,
          ...body,
        });
      }),
  );
