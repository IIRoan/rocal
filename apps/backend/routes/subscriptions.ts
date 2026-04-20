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
            summary: "Get all calendar subscriptions for user",
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
            name: t.String(),
            url: t.String({ format: "uri" }),
            color: t.Optional(t.String()),
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
          params: strictObject({ id: t.String() }),
          body: strictObject({
            name: t.Optional(t.String()),
            color: t.Optional(t.String()),
            isActive: t.Optional(t.Boolean()),
            syncIntervalMinutes: t.Optional(
              t.Number({ minimum: 5, maximum: 1440 }),
            ),
          }),
          detail: {
            summary: "Update calendar subscription",
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
          params: strictObject({ id: t.String() }),
          query: strictObject({
            deleteEvents: t.Optional(t.Boolean()),
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
          params: strictObject({ id: t.String() }),
          detail: {
            summary: "Manually trigger subscription sync",
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
            calendarId: t.String(),
            icsContent: t.String(),
            fileName: t.Optional(t.String()),
          }),
          detail: {
            summary: "Import ICS file manually",
            description:
              "Manually imports events from an ICS file content into a specific calendar.",
          },
        },
      ),
  );
