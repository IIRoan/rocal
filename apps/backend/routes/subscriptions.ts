import { Elysia } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import { authenticatedRouteDetail } from "../lib/openapi";
import { prisma } from "../lib/prisma";
import { SubscriptionService } from "../services/subscription.service";
import { RouteModel, routeModels } from "../contracts";

const subscriptionService = new SubscriptionService(prisma);

// Re-export syncCalendarSubscription for use by calendar-sync-service
export async function syncCalendarSubscription(
  subscription: Parameters<SubscriptionService["syncCalendarSubscription"]>[0],
) {
  return subscriptionService.syncCalendarSubscription(subscription);
}

export const subscriptionsRoute = new Elysia({ normalize: false })
  .use(routeModels)
  .use(requireAuth)
  .guard(authenticatedRouteDetail("Calendar Subscriptions"), (app) =>
    app
      .get("/subscriptions", {
        detail: {
          summary: "List calendar subscriptions",
          description:
            "Returns the authenticated user's external calendar subscriptions, including sync status and metadata needed to manage read-only mirrored calendars.",
        },
      }, async ({ routeUser }) => {
        return subscriptionService.list(routeUser.id);
      })

      .post("/subscriptions", {
        body: RouteModel.subscriptions.createBody,
        detail: {
          summary: "Subscribe to an external calendar",
          description:
            "Creates a new sync-only calendar and subscribes to an external .ics feed. Events are read-only and synced automatically.",
        },
      }, async ({ body, routeUser }) => {
        return subscriptionService.create({
          userId: routeUser.id,
          name: body.name,
          url: body.url,
          color: body.color,
        });
      })

      .put("/subscriptions/:id", {
        params: RouteModel.subscriptions.idParams,
        body: RouteModel.subscriptions.updateBody,
        detail: {
          summary: "Update calendar subscription",
          description:
            "Adjusts subscription metadata and sync behavior. This is useful for pausing a feed, recoloring the mirrored calendar, or changing the polling cadence.",
        },
      }, async ({ params, body, routeUser }) => {
        return subscriptionService.update({
          userId: routeUser.id,
          subscriptionId: params.id,
          name: body.name,
          color: body.color,
          isActive: body.isActive,
          syncIntervalMinutes: body.syncIntervalMinutes,
        });
      })

      .delete("/subscriptions/:id", {
        parse: "none",
        params: RouteModel.subscriptions.idParams,
        query: RouteModel.subscriptions.deleteQuery,
        detail: {
          summary: "Delete calendar subscription",
          description:
            "Deletes a subscription. If deleteEvents is true, also deletes all synced events. Otherwise, events are kept but lose their sync association.",
        },
      }, async ({ params, query, routeUser }) => {
        return subscriptionService.delete({
          userId: routeUser.id,
          subscriptionId: params.id,
          deleteEvents: query.deleteEvents ?? false,
        });
      })

      .post("/subscriptions/:id/sync", {
        params: RouteModel.subscriptions.idParams,
        detail: {
          summary: "Manually trigger subscription sync",
          description:
            "Immediately fetches the remote ICS feed and reconciles imported events without waiting for the next scheduled sync interval.",
        },
      }, async ({ params, routeUser }) => {
        return subscriptionService.sync({
          userId: routeUser.id,
          subscriptionId: params.id,
        });
      })

      .post("/subscriptions/import-ics", {
        body: RouteModel.subscriptions.importIcsBody,
        detail: {
          summary: "Import ICS file manually",
          description:
            "Parses a raw ICS payload and imports its events into a specific calendar. This is useful for one-off imports when no ongoing subscription is needed.",
        },
      }, async ({ body, routeUser }) => {
        return subscriptionService.importIcs({
          userId: routeUser.id,
          calendarId: body.calendarId,
          icsContent: body.icsContent,
          fileName: body.fileName,
        });
      }),
  );
