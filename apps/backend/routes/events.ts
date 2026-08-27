import { Elysia } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import { authenticatedRouteDetail } from "../lib/openapi";
import { prisma } from "../lib/prisma";
import { EventService } from "../services/event.service";
import { createStalwartCalendarClient } from "../lib/stalwart-calendar";
import { MailCalendarIngestionService } from "../services/mail-calendar-ingestion.service";
import { RouteModel, routeModels } from "../contracts";

const stalwartClient = createStalwartCalendarClient();
const eventService = new EventService(prisma, undefined, stalwartClient);
const mailCalendarIngestionService = new MailCalendarIngestionService(
  prisma,
  undefined,
  stalwartClient,
);

export const eventsRoutes = new Elysia({
  prefix: "/events",
  normalize: false,
})
  .use(routeModels)
  .use(requireAuth)
  .guard(authenticatedRouteDetail("Events"), (app) =>
    app
      .get("/search", {
        query: RouteModel.events.searchQuery,
        detail: {
          summary: "Search events by text",
          description:
            "Full-text search across plaintext event fields with blind-index fallback for encrypted events.",
        },
      }, async ({ query, routeUser }) => {
        return eventService.search({
          userId: routeUser.id,
          query: query.q,
          blindIndexTokens: query.blindIndexTokens
            ?.split(",")
            .map((token) => token.trim())
            .filter(Boolean),
          limit: query.limit,
          offset: query.offset,
          startDate: query.startDate,
          endDate: query.endDate,
        });
      })
      .get("/search-corpus", {
        query: RouteModel.events.searchCorpusQuery,
        detail: {
          summary: "List calendar events for private local search indexing",
          description:
            "Returns a paginated event corpus for authenticated device-local search indexing, preserving event encryption fields for client-side hydration.",
        },
      }, async ({ query, routeUser }) => {
        return eventService.searchCorpus({
          userId: routeUser.id,
          limit: query.limit,
          offset: query.offset,
          updatedAfter: query.updatedAfter,
        });
      })
      .get("/", {
        query: RouteModel.events.dateRangeQuery,
        detail: {
          summary: "Get user's calendar events within date range",
          description:
            "Fetches authenticated user's events within the specified date range, including associated categories for efficient frontend rendering",
        },
      }, async ({ query: { start, end }, routeUser }) => {
        return eventService.list({
          userId: routeUser.id,
          start,
          end,
        });
      })

      .post("/", {
        body: RouteModel.events.createBody,
        detail: {
          summary: "Create a new calendar event",
          description:
            "Creates a new calendar event for the authenticated user with proper validation",
        },
      }, async ({ body, routeUser }) => {
        return eventService.create({ userId: routeUser.id, ...body });
      })

      .get("/:id/ics", {
        params: RouteModel.events.idParams,
        detail: {
          summary: "Download a single event as .ics",
        },
      }, async ({ params, routeUser, set }) => {
        const result = await eventService.exportIcs(routeUser.id, params.id);
      
        set.headers["Content-Type"] = "text/calendar; charset=utf-8";
        set.headers["Content-Disposition"] =
          `attachment; filename="${result.filename}"`;
        set.headers["Cache-Control"] = "no-store";
      
        return result.icsContent;
      })

      .get("/invitations/by-external-id", {
        query: RouteModel.events.invitationByExternalIdQuery,
        detail: {
          summary: "Find a mailed calendar invitation by external UID",
        },
      }, async ({ query, routeUser }) => {
        const event = await eventService.getInvitationByExternalId(
          routeUser.id,
          query.externalId,
          {
            syncRemote: query.syncRemote !== false,
          },
        );
        return { event };
      })

      .post("/invitations/import-ics", {
        body: RouteModel.events.importIcsBody,
        detail: {
          summary: "Import a decrypted mailed calendar invitation",
        },
      }, async ({ body, routeUser }) => {
        return mailCalendarIngestionService.ingestIcsContent({
          userId: routeUser.id,
          icsContent: body.icsContent,
          sourceId: "Decrypted mail invitation",
          attendeeStatus: body.status,
          calendarId: body.calendarId,
          encryption: body.encryption,
        });
      })

      .post("/invitations/decline-ics", {
        body: RouteModel.events.declineIcsBody,
        detail: {
          summary: "Decline a mailed calendar invitation without importing it",
        },
      }, async ({ body, routeUser }) => {
        return mailCalendarIngestionService.declineIcsInvitation({
          userId: routeUser.id,
          icsContent: body.icsContent,
        });
      })

      .post("/:id/rsvp", {
        params: RouteModel.events.idParams,
        body: RouteModel.events.rsvpBody,
        detail: {
          summary: "Respond to a mailed calendar invitation",
        },
      }, async ({ params, body, routeUser }) => {
        return eventService.respondToInvitation({
          userId: routeUser.id,
          eventId: params.id,
          status: body.status,
        });
      })

      .post("/:id/seal-encryption", {
        params: RouteModel.events.idParams,
        body: RouteModel.events.sealEncryptionBody,
        detail: {
          summary: "Seal imported invitation encryption on Solace",
          description:
            "Stores ciphertext for an imported invitation without changing scheduling metadata or Stalwart copies.",
        },
      }, async ({ params, body, routeUser }) => {
        return eventService.sealEncryption({
          userId: routeUser.id,
          eventId: params.id,
          encryptedContent: body.encryptedContent,
          blindIndexTokens: body.blindIndexTokens,
          encryptionKeyVersion: body.encryptionKeyVersion,
        });
      })

      .get("/:id", {
        params: RouteModel.events.idParams,
        detail: {
          summary: "Get a calendar event by ID",
          description:
            "Fetches a single calendar event for the authenticated user, including its calendar and category",
        },
      }, async ({ params, routeUser }) => {
        return eventService.getById(routeUser.id, params.id);
      })

      .put("/:id", {
        params: RouteModel.events.idParams,
        body: RouteModel.events.updateBody,
        detail: {
          summary: "Update an existing calendar event",
          description:
            "Updates an existing calendar event with ownership verification and optimistic locking to prevent concurrent update conflicts",
        },
      }, async ({ params, body, routeUser }) => {
        return eventService.update({
          userId: routeUser.id,
          eventId: params.id,
          ...body,
        });
      })

      .delete("/:id", {
        params: RouteModel.events.idParams,
        detail: {
          summary: "Delete a calendar event",
          description:
            "Deletes a calendar event with proper user ownership verification",
        },
      }, async ({ params, routeUser }) => {
        return eventService.delete(routeUser.id, params.id);
      })

      .post("/bulk", {
        body: RouteModel.events.bulkBody,
        detail: {
          summary: "Perform bulk operations on events",
          description: "Move, delete, or duplicate multiple events at once",
        },
      }, async ({ body, routeUser }) => {
        return eventService.bulkAction({
          userId: routeUser.id,
          action: body.action,
          eventIds: body.eventIds,
          targetCalendarId: body.targetCalendarId,
        });
      }),
  );
