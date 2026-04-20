import Elysia, { t } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import type { AuthenticatedUser } from "../lib/auth-utils";
import { authenticatedRouteDetail } from "../lib/openapi";
import { resolveRouteUser } from "../lib/request-user";
import { strictObject } from "../lib/validation";
import { prisma } from "../lib/prisma";
import { SubscriptionService } from "../services/subscription.service";

const subscriptionService = new SubscriptionService(prisma);

// Re-export syncCalendarSubscription for use by calendar-sync-service
export async function syncCalendarSubscription(
  subscription: Parameters<SubscriptionService["syncCalendarSubscription"]>[0],
) {
  return subscriptionService.syncCalendarSubscription(subscription);
}

export const subscriptionsRoute = new Elysia({ normalize: false })
  .use(requireAuth)
  .guard(authenticatedRouteDetail("Calendar Subscriptions"), (app) =>
    app
      .get(
        "/subscriptions",
        async ({
          authenticatedUser,
          request,
        }: {
          authenticatedUser?: AuthenticatedUser;
          request: Request;
        }) => {
          const user = await resolveRouteUser(authenticatedUser, request);
          return subscriptionService.list(user.id);
        },
        {
          detail: {
            summary: "List calendar subscriptions",
            description:
              "Returns the authenticated user's external calendar subscriptions, including sync status and metadata needed to manage read-only mirrored calendars.",
          },
        },
      )

      .post(
        "/subscriptions",
        async ({
          body,
          authenticatedUser,
          request,
        }: {
          body: { name: string; url: string; color?: string };
          authenticatedUser?: AuthenticatedUser;
          request: Request;
        }) => {
          const user = await resolveRouteUser(authenticatedUser, request);
          return subscriptionService.create({
            userId: user.id,
            name: body.name,
            url: body.url,
            color: body.color,
          });
        },
        {
          body: strictObject({
            name: t.String({
              description: "Display name for the synced calendar.",
              examples: ["Team holidays", "Vendor schedule"],
            }),
            url: t.String({
              format: "uri",
              description: "Absolute URL to the remote ICS feed.",
              examples: ["https://example.com/calendar.ics"],
            }),
            color: t.Optional(
              t.String({
                description:
                  "Optional color applied to the generated sync-only calendar.",
                examples: ["#7c3aed"],
              }),
            ),
          }),
          detail: {
            summary: "Subscribe to an external calendar",
            description:
              "Creates a new sync-only calendar and subscribes to an external .ics feed. Events are read-only and synced automatically.",
          },
        },
      )

      .put(
        "/subscriptions/:id",
        async ({
          params,
          body,
          authenticatedUser,
          request,
        }: {
          params: { id: string };
          body: {
            name?: string;
            color?: string;
            isActive?: boolean;
            syncIntervalMinutes?: number;
          };
          authenticatedUser?: AuthenticatedUser;
          request: Request;
        }) => {
          const user = await resolveRouteUser(authenticatedUser, request);
          return subscriptionService.update({
            userId: user.id,
            subscriptionId: params.id,
            name: body.name,
            color: body.color,
            isActive: body.isActive,
            syncIntervalMinutes: body.syncIntervalMinutes,
          });
        },
        {
          params: strictObject({
            id: t.String({
              description: "Subscription identifier.",
            }),
          }),
          body: strictObject({
            name: t.Optional(
              t.String({
                description: "Updated subscription display name.",
              }),
            ),
            color: t.Optional(
              t.String({
                description: "Updated calendar color.",
              }),
            ),
            isActive: t.Optional(
              t.Boolean({
                description:
                  "Whether scheduled background sync should continue running for this subscription.",
              }),
            ),
            syncIntervalMinutes: t.Optional(
              t.Number({
                minimum: 5,
                maximum: 1440,
                description:
                  "Polling interval in minutes for automatic sync jobs.",
              }),
            ),
          }),
          detail: {
            summary: "Update calendar subscription",
            description:
              "Adjusts subscription metadata and sync behavior. This is useful for pausing a feed, recoloring the mirrored calendar, or changing the polling cadence.",
          },
        },
      )

      .delete(
        "/subscriptions/:id",
        async ({
          params,
          authenticatedUser,
          request,
        }: {
          params: { id: string };
          authenticatedUser?: AuthenticatedUser;
          request: Request;
        }) => {
          const user = await resolveRouteUser(authenticatedUser, request);
          return subscriptionService.delete({
            userId: user.id,
            subscriptionId: params.id,
          });
        },
        {
          params: strictObject({
            id: t.String({
              description: "Subscription identifier.",
            }),
          }),
          query: strictObject({
            deleteEvents: t.Optional(
              t.Boolean({
                description:
                  "When true, also remove events that were previously imported from the subscription.",
              }),
            ),
          }),
          detail: {
            summary: "Delete calendar subscription",
            description:
              "Deletes a subscription. If deleteEvents is true, also deletes all synced events. Otherwise, events are kept but lose their sync association.",
          },
        },
      )

      .post(
        "/subscriptions/:id/sync",
        async ({
          params,
          authenticatedUser,
          request,
        }: {
          params: { id: string };
          authenticatedUser?: AuthenticatedUser;
          request: Request;
        }) => {
          const user = await resolveRouteUser(authenticatedUser, request);
          return subscriptionService.sync({
            userId: user.id,
            subscriptionId: params.id,
          });
        },
        {
          params: strictObject({
            id: t.String({
              description: "Subscription identifier.",
            }),
          }),
          detail: {
            summary: "Manually trigger subscription sync",
            description:
              "Immediately fetches the remote ICS feed and reconciles imported events without waiting for the next scheduled sync interval.",
          },
        },
      )

      .post(
        "/subscriptions/import-ics",
        async ({
          body,
          authenticatedUser,
          request,
        }: {
          body: { calendarId: string; icsContent: string; fileName?: string };
          authenticatedUser?: AuthenticatedUser;
          request: Request;
        }) => {
          const user = await resolveRouteUser(authenticatedUser, request);
          return subscriptionService.importIcs({
            userId: user.id,
            calendarId: body.calendarId,
            icsContent: body.icsContent,
            fileName: body.fileName,
          });
        },
        {
          body: strictObject({
            calendarId: t.String({
              description: "Destination calendar that should receive the imported events.",
            }),
            icsContent: t.String({
              description: "Raw ICS file contents.",
            }),
            fileName: t.Optional(
              t.String({
                description:
                  "Optional original filename used for diagnostics or import summaries.",
                examples: ["conference-schedule.ics"],
              }),
            ),
          }),
          detail: {
            summary: "Import ICS file manually",
            description:
              "Parses a raw ICS payload and imports its events into a specific calendar. This is useful for one-off imports when no ongoing subscription is needed.",
          },
        },
      ),
  );
