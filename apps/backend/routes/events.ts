import { Elysia, t } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import { ensureAuthenticatedUser } from "../lib/auth-utils";
import { strictObject } from "../lib/validation";
import { prisma } from "../lib/prisma";
import { EventService } from "../services/event.service";

const eventService = new EventService(prisma);

export const eventsRoutes = new Elysia({
  prefix: "/events",
  normalize: false,
})
  .use(requireAuth)
  .get(
    "/search",
    async ({
      query,
      user,
      request,
    }: {
      query: {
        q: string;
        limit?: number;
        offset?: number;
        startDate?: string;
        endDate?: string;
      };
      user?: unknown;
      request: Request;
    }) => {
      const { id: userId } = await ensureAuthenticatedUser(user, request);
      return eventService.search({
        userId,
        query: query.q,
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
        tags: ["Events"],
        summary: "Search events by text",
        description:
          "Full-text search across event title, description, and location. Uses PostgreSQL tsvector for fast lookups with ILIKE fallback for short queries.",
        security: [{ bearerAuth: [] }],
      },
    },
  )
  .get(
    "/",
    async ({
      query: { start, end },
      user,
      request,
    }: {
      query: { start: string; end: string };
      user?: unknown;
      request: Request;
    }) => {
      const { id: userId } = await ensureAuthenticatedUser(user, request);
      return eventService.list({ userId, start, end });
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
        tags: ["Events"],
        summary: "Get user's calendar events within date range",
        description:
          "Fetches authenticated user's events within the specified date range, including associated categories for efficient frontend rendering",
        security: [{ bearerAuth: [] }],
      },
    },
  )

  .post(
    "/",
    async ({
      body,
      user,
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
      };
      user?: unknown;
      request: Request;
    }) => {
      const { id: userId } = await ensureAuthenticatedUser(user, request);
      return eventService.create({ userId, ...body });
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
              description: "Reminder time in minutes before event (0-43200)",
            }),
            t.Null(),
          ]),
        ),
        recurrence: t.Optional(
          t.String({
            description: "JSON string of recurrence rule for recurring events",
          }),
        ),
      }),
      detail: {
        tags: ["Events"],
        summary: "Create a new calendar event",
        description:
          "Creates a new calendar event for the authenticated user with proper validation",
        security: [{ bearerAuth: [] }],
      },
    },
  )

  .get(
    "/:id/ics",
    async ({
      params,
      user,
      request,
      set,
    }: {
      params: { id: string };
      user?: unknown;
      request: Request;
      set: { headers: Record<string, string | number | undefined> };
    }) => {
      const { id: userId } = await ensureAuthenticatedUser(user, request);
      const result = await eventService.exportIcs(userId, params.id);

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
        tags: ["Events"],
        summary: "Download a single event as .ics",
        security: [{ bearerAuth: [] }],
      },
    },
  )

  .get(
    "/:id",
    async ({
      params,
      user,
      request,
    }: {
      params: { id: string };
      user?: unknown;
      request: Request;
    }) => {
      const { id: userId } = await ensureAuthenticatedUser(user, request);
      return eventService.getById(userId, params.id);
    },
    {
      params: strictObject({
        id: t.String({ description: "Event ID to fetch" }),
      }),
      detail: {
        tags: ["Events"],
        summary: "Get a calendar event by ID",
        description:
          "Fetches a single calendar event for the authenticated user, including its calendar and category",
        security: [{ bearerAuth: [] }],
      },
    },
  )

  .put(
    "/:id",
    async ({
      params,
      body,
      user,
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
      };
      user?: unknown;
      request: Request;
    }) => {
      const { id: userId } = await ensureAuthenticatedUser(user, request);
      return eventService.update({ userId, eventId: params.id, ...body });
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
          t.String({ description: "IANA timezone identifier for the event" }),
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
          t.String({ description: "ID of the calendar (must belong to user)" }),
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
              description: "Reminder time in minutes before event (0-43200)",
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
      }),
      detail: {
        tags: ["Events"],
        summary: "Update an existing calendar event",
        description:
          "Updates an existing calendar event with ownership verification and optimistic locking to prevent concurrent update conflicts",
        security: [{ bearerAuth: [] }],
      },
    },
  )

  .delete(
    "/:id",
    async ({
      params,
      user,
      request,
    }: {
      params: { id: string };
      user?: unknown;
      request: Request;
    }) => {
      const { id: userId } = await ensureAuthenticatedUser(user, request);
      return eventService.delete(userId, params.id);
    },
    {
      params: strictObject({
        id: t.String({ description: "Event ID to delete" }),
      }),
      detail: {
        tags: ["Events"],
        summary: "Delete a calendar event",
        description:
          "Deletes a calendar event with proper user ownership verification",
        security: [{ bearerAuth: [] }],
      },
    },
  )

  .post(
    "/bulk",
    async ({
      body,
      user,
      request,
    }: {
      body: {
        action: "move" | "delete" | "duplicate";
        eventIds: string[];
        targetCalendarId?: string;
      };
      user?: unknown;
      request: Request;
    }) => {
      const { id: userId } = await ensureAuthenticatedUser(user, request);
      return eventService.bulkAction({
        userId,
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
        tags: ["Events"],
        summary: "Perform bulk operations on events",
        description: "Move, delete, or duplicate multiple events at once",
        security: [{ bearerAuth: [] }],
      },
    },
  );
