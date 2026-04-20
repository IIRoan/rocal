import { Elysia, t } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import { ensureAuthenticatedUser } from "../lib/auth-utils";
import { strictObject } from "../lib/validation";
import { prisma } from "../lib/prisma";
import { CalendarService } from "../services/calendar.service";

const calendarService = new CalendarService(prisma);

const createCalendarBodySchema = strictObject({
  name: t.String({
    minLength: 1,
    maxLength: 100,
    description: "Calendar name (required, 1-100 characters)",
  }),
  color: t.String({
    description:
      "Calendar color (blue, orange, violet, rose, emerald, or hex color like #FF0000)",
  }),
  isDefault: t.Optional(
    t.Boolean({
      description:
        "Whether this should be the default calendar (default: false)",
    }),
  ),
});

const updateCalendarBodySchema = strictObject({
  name: t.Optional(
    t.String({
      minLength: 1,
      maxLength: 100,
      description: "Calendar name (1-100 characters)",
    }),
  ),
  color: t.Optional(
    t.String({
      description:
        "Calendar color (blue, orange, violet, rose, emerald, or hex color like #FF0000)",
    }),
  ),
  isVisible: t.Optional(
    t.Boolean({ description: "Whether the calendar is visible" }),
  ),
  isDefault: t.Optional(
    t.Boolean({ description: "Whether this should be the default calendar" }),
  ),
});

const deleteCalendarQuerySchema = strictObject({
  action: t.Optional(
    t.Union([t.Literal("delete_events"), t.Literal("move_events")], {
      description:
        "What to do with events: delete_events (default), or move_events",
    }),
  ),
  targetCalendarId: t.Optional(
    t.String({
      description: "Target calendar ID when using move_events action",
    }),
  ),
});

export const calendarsRoutes = new Elysia({
  prefix: "/calendars",
  normalize: false,
})
  .use(requireAuth)
  .get(
    "/",
    async ({ user, request }: { user?: unknown; request: Request }) => {
      const { id: userId } = await ensureAuthenticatedUser(user, request);
      return calendarService.list(userId);
    },
    {
      detail: {
        tags: ["Calendars"],
        summary: "Get user's calendars",
        description:
          "Fetches all calendars belonging to the authenticated user",
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
      body: { name: string; color: string; isDefault?: boolean };
      user?: unknown;
      request: Request;
    }) => {
      const { id: userId } = await ensureAuthenticatedUser(user, request);
      return calendarService.create({
        userId,
        name: body.name,
        color: body.color,
        isDefault: body.isDefault,
      });
    },
    {
      body: createCalendarBodySchema,
      detail: {
        tags: ["Calendars"],
        summary: "Create a new calendar",
        description: "Creates a new calendar for the authenticated user",
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
        name?: string;
        color?: string;
        isVisible?: boolean;
        isDefault?: boolean;
      };
      user?: unknown;
      request: Request;
    }) => {
      const { id: userId } = await ensureAuthenticatedUser(user, request);
      return calendarService.update({
        userId,
        calendarId: params.id,
        name: body.name,
        color: body.color,
        isVisible: body.isVisible,
        isDefault: body.isDefault,
      });
    },
    {
      params: strictObject({ id: t.String({ description: "Calendar ID" }) }),
      body: updateCalendarBodySchema,
      detail: {
        tags: ["Calendars"],
        summary: "Update an existing calendar",
        description: "Updates an existing calendar with ownership verification",
        security: [{ bearerAuth: [] }],
      },
    },
  )

  .delete(
    "/:id",
    async ({
      params,
      query,
      user,
      request,
    }: {
      params: { id: string };
      query: {
        action?: "delete_events" | "move_events";
        targetCalendarId?: string;
      };
      user?: unknown;
      request: Request;
    }) => {
      const { id: userId } = await ensureAuthenticatedUser(user, request);
      return calendarService.delete({
        userId,
        calendarId: params.id,
        action: query.action,
        targetCalendarId: query.targetCalendarId,
      });
    },
    {
      params: strictObject({
        id: t.String({ description: "Calendar ID to delete" }),
      }),
      query: deleteCalendarQuerySchema,
      detail: {
        tags: ["Calendars"],
        summary: "Delete a calendar with event handling options",
        description: `Deletes a calendar with options for handling existing events:
        - delete_events: (default) Delete calendar and all its events
        - move_events: Move all events to another calendar (requires targetCalendarId)`,
        security: [{ bearerAuth: [] }],
      },
    },
  );
