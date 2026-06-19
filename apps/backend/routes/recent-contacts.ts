import { Elysia } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import { authenticatedRouteDetail } from "../lib/openapi";
import { prisma } from "../lib/prisma";
import { RecentContactsService } from "../services/recent-contacts.service";
import { RouteModel, routeModels } from "../contracts";

const recentContactsService = new RecentContactsService(prisma);

export const recentContactsRoutes = new Elysia({
  prefix: "/recent-contacts",
  normalize: false,
})
  .use(routeModels)
  .use(requireAuth)
  .guard(authenticatedRouteDetail("Recent contacts"), (app) =>
    app
      .get(
        "/",
        async ({ routeUser }) => {
          const record = await recentContactsService.get(routeUser.id);
          if (!record) {
            return new Response(JSON.stringify(null), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
          return record;
        },
        {
          detail: {
            summary: "Get encrypted recent contacts",
            description:
              "Fetches the authenticated user's encrypted recent-contacts blob",
          },
        },
      )
      .put(
        "/",
        async ({ body, routeUser }) => {
          return recentContactsService.upsert({
            userId: routeUser.id,
            ...body,
          });
        },
        {
          body: RouteModel.recentContacts.putBody,
          detail: {
            summary: "Upsert encrypted recent contacts",
            description:
              "Stores or updates the authenticated user's encrypted recent-contacts blob",
          },
        },
      ),
  );
