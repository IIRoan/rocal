import { Elysia, t } from "elysia";
import { requireAuth } from "../lib/auth-guard";
import type { AuthenticatedUser } from "../lib/auth-utils";
import { authenticatedRouteDetail } from "../lib/openapi";
import { resolveRouteUser } from "../lib/request-user";
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
  encryptedName: t.Optional(
    t.String({
      description: "Client-encrypted shadow copy of the calendar name.",
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
  encryptedName: t.Optional(
    t.String({
      description: "Client-encrypted shadow copy of the calendar name.",
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
  .guard(authenticatedRouteDetail("Calendars"), (app) =>
    app
      .get(
        "/",
        async ({
          authenticatedUser,
          request,
        }: {
          authenticatedUser?: AuthenticatedUser;
          request: Request;
        }) => {
          const user = await resolveRouteUser(authenticatedUser, request);
          return calendarService.list(user.id);
        },
        {
          detail: {
            summary: "Get user's calendars",
            description:
              "Fetches all calendars belonging to the authenticated user",
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
            name: string;
            color: string;
            isDefault?: boolean;
            encryptedName?: string;
            blindIndexTokens?: string[];
            encryptionState?: string;
            encryptionKeyVersion?: number;
          };
          authenticatedUser?: AuthenticatedUser;
          request: Request;
        }) => {
          const user = await resolveRouteUser(authenticatedUser, request);
          return calendarService.create({
            userId: user.id,
            name: body.name,
            color: body.color,
            isDefault: body.isDefault,
            encryptedName: body.encryptedName,
            blindIndexTokens: body.blindIndexTokens,
            encryptionState: body.encryptionState,
            encryptionKeyVersion: body.encryptionKeyVersion,
          });
        },
        {
          body: createCalendarBodySchema,
          detail: {
            summary: "Create a new calendar",
            description: "Creates a new calendar for the authenticated user",
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
            name?: string;
            color?: string;
            isVisible?: boolean;
            isDefault?: boolean;
            encryptedName?: string;
            blindIndexTokens?: string[];
            encryptionState?: string;
            encryptionKeyVersion?: number;
          };
          authenticatedUser?: AuthenticatedUser;
          request: Request;
        }) => {
          const user = await resolveRouteUser(authenticatedUser, request);
          return calendarService.update({
            userId: user.id,
            calendarId: params.id,
            name: body.name,
            color: body.color,
            isVisible: body.isVisible,
            isDefault: body.isDefault,
            encryptedName: body.encryptedName,
            blindIndexTokens: body.blindIndexTokens,
            encryptionState: body.encryptionState,
            encryptionKeyVersion: body.encryptionKeyVersion,
          });
        },
        {
          params: strictObject({ id: t.String({ description: "Calendar ID" }) }),
          body: updateCalendarBodySchema,
          detail: {
            summary: "Update an existing calendar",
            description:
              "Updates an existing calendar with ownership verification",
          },
        },
      )

      .delete(
        "/:id",
        async ({
          params,
          query,
          authenticatedUser,
          request,
        }: {
          params: { id: string };
          query: {
            action?: "delete_events" | "move_events";
            targetCalendarId?: string;
          };
          authenticatedUser?: AuthenticatedUser;
          request: Request;
        }) => {
          const user = await resolveRouteUser(authenticatedUser, request);
          return calendarService.delete({
            userId: user.id,
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
            summary: "Delete a calendar with event handling options",
            description: `Deletes a calendar with options for handling existing events:
        - delete_events: (default) Delete calendar and all its events
        - move_events: Move all events to another calendar (requires targetCalendarId)`,
          },
        },
      ),
  );
