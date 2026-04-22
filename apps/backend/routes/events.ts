import { Elysia, t } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import type { AuthenticatedUser } from "../lib/auth-utils";
import { authenticatedRouteDetail } from "../lib/openapi";
import { resolveRouteUser } from "../lib/request-user";
import { strictObject } from "../lib/validation";
import { prisma } from "../lib/prisma";
import { EventService } from "../services/event.service";

const eventService = new EventService(prisma);

export const eventsRoutes = new Elysia({
  prefix: "/events",
  normalize: false,
})
  .use(requireAuth)
  .guard(authenticatedRouteDetail("Events"), (app) =>
    app.get(
      "/search",
      async ({
        query,
        authenticatedUser,
        request,
      }: {
        query: {
          q: string;
          blindIndexTokens?: string;
          limit?: number;
          offset?: number;
          startDate?: string;
          endDate?: string;
        };
        authenticatedUser?: AuthenticatedUser;
        request: Request;
      }) => {
        const user = await resolveRouteUser(authenticatedUser, request);
        return eventService.search({
          userId: user.id,
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
      },
      {
        query: strictObject({
          q: t.String({
            description: "Search query (min 2 characters)",
            minLength: 2,
          }),
          limit: t.Optional(
            t.Number({
              description: "Max results to return (default 20, max 50)",
              minimum: 1,
              maximum: 50,
            }),
          ),
          blindIndexTokens: t.Optional(
            t.String({
              description:
                "Comma-separated blind-index tokens for encrypted event search.",
            }),
          ),
          offset: t.Optional(
            t.Number({
              description: "Offset for pagination (default 0)",
              minimum: 0,
            }),
          ),
          startDate: t.Optional(
            t.String({
              description: "Filter events starting after this date (ISO 8601)",
            }),
          ),
          endDate: t.Optional(
            t.String({
              description: "Filter events ending before this date (ISO 8601)",
            }),
          ),
        }),
        detail: {
          summary: "Search events by text",
          description:
              "Full-text search across plaintext event fields with blind-index fallback for encrypted events.",
        },
      },
    )
      .get(
        "/",
      async ({
        query: { start, end },
        authenticatedUser,
        request,
        }: {
          query: { start: string; end: string };
          authenticatedUser?: AuthenticatedUser;
          request: Request;
        }) => {
          const user = await resolveRouteUser(authenticatedUser, request);
          return eventService.list({
            userId: user.id,
            start,
            end,
          });
        },
        {
          query: strictObject({
            start: t.String({
              description: "Start date in ISO 8601 format",
              examples: ["2024-01-01T00:00:00.000Z"],
            }),
            end: t.String({
              description: "End date in ISO 8601 format",
              examples: ["2024-01-31T23:59:59.999Z"],
            }),
          }),
          detail: {
            summary: "Get user's calendar events within date range",
            description:
              "Fetches authenticated user's events within the specified date range, including associated categories for efficient frontend rendering",
          },
        },
      )

      .post(
        "/",
        async ({
          body,
          authenticatedUser,
          request,
        }: {
          body: {
            title: string;
            description?: string;
            start: string;
            end: string;
            allDay?: boolean;
            location?: string;
            color?: string;
            calendarId: string;
            categoryId?: string;
            timezone?: string;
            reminder?: number | null;
            recurrence?: string;
            encryptedContent?: string;
            blindIndexTokens?: string[];
            encryptionState?: string;
            encryptionKeyVersion?: number;
          };
          authenticatedUser?: AuthenticatedUser;
          request: Request;
        }) => {
          const user = await resolveRouteUser(authenticatedUser, request);
          return eventService.create({ userId: user.id, ...body });
        },
        {
          body: strictObject({
            title: t.String({
              minLength: 1,
              maxLength: 255,
              description: "Event title (required, 1-255 characters)",
            }),
            description: t.Optional(
              t.String({
                maxLength: 1000,
                description: "Event description (optional, max 1000 characters)",
              }),
            ),
            start: t.String({
              description: "Start date in ISO 8601 format",
              examples: ["2024-01-01T09:00:00.000Z"],
            }),
            end: t.String({
              description: "End date in ISO 8601 format",
              examples: ["2024-01-01T10:00:00.000Z"],
            }),
            allDay: t.Optional(
              t.Boolean({
                description: "Whether the event is all-day (default: false)",
              }),
            ),
            location: t.Optional(
              t.String({
                maxLength: 255,
                description: "Event location (optional, max 255 characters)",
              }),
            ),
            color: t.Optional(
              t.String({
                description: "Event color (blue, orange, violet, rose, emerald)",
              }),
            ),
            calendarId: t.String({
              description: "ID of the calendar (required, must belong to user)",
            }),
            categoryId: t.Optional(
              t.String({
                description: "ID of the event category (must belong to user)",
              }),
            ),
            timezone: t.Optional(
              t.String({
                description: "IANA timezone identifier for the event",
              }),
            ),
            reminder: t.Optional(
              t.Union([
                t.Number({
                  minimum: 0,
                  maximum: 43200,
                  description:
                    "Reminder time in minutes before event (0-43200)",
                }),
                t.Null(),
              ]),
            ),
            recurrence: t.Optional(
              t.String({
                description:
                  "JSON string of recurrence rule for recurring events",
              }),
            ),
            encryptedContent: t.Optional(
              t.String({
                description: "Client-encrypted shadow copy of sensitive event content.",
              }),
            ),
            blindIndexTokens: t.Optional(
              t.Array(
                t.String({
                  description: "Blind-index token hash for encrypted search rollout.",
                }),
              ),
            ),
            encryptionState: t.Optional(
              t.String({
                description:
                  "Encryption rollout state for this row (for example: plaintext or shadow_write).",
              }),
            ),
            encryptionKeyVersion: t.Optional(
              t.Number({
                minimum: 1,
                description: "Client-managed encryption key version.",
              }),
            ),
          }),
          detail: {
            summary: "Create a new calendar event",
            description:
              "Creates a new calendar event for the authenticated user with proper validation",
          },
        },
      )

      .get(
        "/:id/ics",
        async ({
          params,
          authenticatedUser,
          request,
          set,
        }: {
          params: { id: string };
          authenticatedUser?: AuthenticatedUser;
          request: Request;
          set: { headers: Record<string, string | number | undefined> };
        }) => {
          const user = await resolveRouteUser(authenticatedUser, request);
          const result = await eventService.exportIcs(
            user.id,
            params.id,
          );

          set.headers["Content-Type"] = "text/calendar; charset=utf-8";
          set.headers["Content-Disposition"] =
            `attachment; filename="${result.filename}"`;
          set.headers["Cache-Control"] = "no-store";

          return result.icsContent;
        },
        {
          params: strictObject({
            id: t.String({ description: "Event ID to export as ICS" }),
          }),
          detail: {
            summary: "Download a single event as .ics",
          },
        },
      )

      .get(
        "/:id",
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
          return eventService.getById(user.id, params.id);
        },
        {
          params: strictObject({
            id: t.String({ description: "Event ID to fetch" }),
          }),
          detail: {
            summary: "Get a calendar event by ID",
            description:
              "Fetches a single calendar event for the authenticated user, including its calendar and category",
          },
        },
      )

      .put(
        "/:id",
        async ({
          params,
          body,
          authenticatedUser,
          request,
        }: {
          params: { id: string };
          body: {
            title?: string;
            description?: string;
            start?: string;
            end?: string;
            timezone?: string;
            allDay?: boolean;
            location?: string;
            color?: string;
            calendarId?: string;
            categoryId?: string;
            reminder?: number | null;
            recurrence?: string | null;
            encryptedContent?: string;
            blindIndexTokens?: string[];
            encryptionState?: string;
            encryptionKeyVersion?: number;
          };
          authenticatedUser?: AuthenticatedUser;
          request: Request;
        }) => {
          const user = await resolveRouteUser(authenticatedUser, request);
          return eventService.update({
            userId: user.id,
            eventId: params.id,
            ...body,
          });
        },
        {
          params: strictObject({
            id: t.String({ description: "Event ID" }),
          }),
          body: strictObject({
            title: t.Optional(
              t.String({
                minLength: 1,
                maxLength: 255,
                description: "Event title (1-255 characters)",
              }),
            ),
            description: t.Optional(
              t.String({
                maxLength: 1000,
                description: "Event description (max 1000 characters)",
              }),
            ),
            start: t.Optional(
              t.String({ description: "Start date in ISO 8601 format" }),
            ),
            end: t.Optional(
              t.String({ description: "End date in ISO 8601 format" }),
            ),
            timezone: t.Optional(
              t.String({
                description: "IANA timezone identifier for the event",
              }),
            ),
            allDay: t.Optional(
              t.Boolean({ description: "Whether the event is all-day" }),
            ),
            location: t.Optional(
              t.String({
                maxLength: 255,
                description: "Event location (max 255 characters)",
              }),
            ),
            color: t.Optional(
              t.String({
                description: "Event color (blue, orange, violet, rose, emerald)",
              }),
            ),
            calendarId: t.Optional(
              t.String({
                description: "ID of the calendar (must belong to user)",
              }),
            ),
            categoryId: t.Optional(
              t.String({
                description: "ID of the event category (must belong to user)",
              }),
            ),
            reminder: t.Optional(
              t.Union([
                t.Number({
                  minimum: 0,
                  maximum: 43200,
                  description:
                    "Reminder time in minutes before event (0-43200)",
                }),
                t.Null(),
              ]),
            ),
            recurrence: t.Optional(
              t.Union([
                t.String({
                  description:
                    "JSON string of recurrence rule for recurring events",
                }),
                t.Null(),
              ]),
            ),
            encryptedContent: t.Optional(
              t.String({
                description: "Client-encrypted shadow copy of sensitive event content.",
              }),
            ),
            blindIndexTokens: t.Optional(
              t.Array(
                t.String({
                  description: "Blind-index token hash for encrypted search rollout.",
                }),
              ),
            ),
            encryptionState: t.Optional(
              t.String({
                description:
                  "Encryption rollout state for this row (for example: plaintext or shadow_write).",
              }),
            ),
            encryptionKeyVersion: t.Optional(
              t.Number({
                minimum: 1,
                description: "Client-managed encryption key version.",
              }),
            ),
          }),
          detail: {
            summary: "Update an existing calendar event",
            description:
              "Updates an existing calendar event with ownership verification and optimistic locking to prevent concurrent update conflicts",
          },
        },
      )

      .delete(
        "/:id",
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
          return eventService.delete(user.id, params.id);
        },
        {
          params: strictObject({
            id: t.String({ description: "Event ID to delete" }),
          }),
          detail: {
            summary: "Delete a calendar event",
            description:
              "Deletes a calendar event with proper user ownership verification",
          },
        },
      )

      .post(
        "/bulk",
        async ({
          body,
          authenticatedUser,
          request,
        }: {
          body: {
            action: "move" | "delete" | "duplicate";
            eventIds: string[];
            targetCalendarId?: string;
          };
          authenticatedUser?: AuthenticatedUser;
          request: Request;
        }) => {
          const user = await resolveRouteUser(authenticatedUser, request);
          return eventService.bulkAction({
            userId: user.id,
            action: body.action,
            eventIds: body.eventIds,
            targetCalendarId: body.targetCalendarId,
          });
        },
        {
          body: strictObject({
            action: t.Union(
              [t.Literal("move"), t.Literal("delete"), t.Literal("duplicate")],
              {
                description:
                  "Bulk operation to perform: move, delete, or duplicate",
              },
            ),
            eventIds: t.Array(t.String(), {
              description: "Array of event IDs to process",
              minItems: 1,
            }),
            targetCalendarId: t.Optional(
              t.String({
                description:
                  "Target calendar ID (required for move, optional for duplicate)",
              }),
            ),
          }),
          detail: {
            summary: "Perform bulk operations on events",
            description: "Move, delete, or duplicate multiple events at once",
          },
        },
      ));
