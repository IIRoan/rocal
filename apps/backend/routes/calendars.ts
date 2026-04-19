import { Elysia, t } from "elysia";
import type { Prisma } from "../generated/prisma/index.js";
import { prisma } from "../lib/prisma";
import { ValidationError } from "../lib/errors";
import { ensureUserCalendars } from "../lib/user-setup";
import { requireAuth } from "../lib/auth-guard";
import { ensureAuthenticatedUser } from "../lib/auth-utils";
import { strictObject } from "../lib/validation";

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

const updateCalendarParamsSchema = strictObject({
  id: t.String({
    description: "Calendar ID",
  }),
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
    t.Boolean({
      description: "Whether the calendar is visible",
    }),
  ),
  isDefault: t.Optional(
    t.Boolean({
      description: "Whether this should be the default calendar",
    }),
  ),
});

const deleteCalendarParamsSchema = strictObject({
  id: t.String({
    description: "Calendar ID to delete",
  }),
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

type CreateCalendarBody = typeof createCalendarBodySchema.static;
type UpdateCalendarParams = typeof updateCalendarParamsSchema.static;
type UpdateCalendarBody = typeof updateCalendarBodySchema.static;
type DeleteCalendarParams = typeof deleteCalendarParamsSchema.static;
type DeleteCalendarQuery = typeof deleteCalendarQuerySchema.static;
type CalendarsContext<
  TParams = Record<string, never>,
  TBody = unknown,
  TQuery = Record<string, string>,
> = {
  params: TParams;
  body: TBody;
  query: TQuery;
  request: Request;
  user?: unknown;
};

import {
  ALLOWED_CALENDAR_COLORS,
  isValidCalendarColor,
} from "../lib/colors";

export const calendarsRoutes = new Elysia({
  prefix: "/calendars",
  normalize: false,
})
  .use(requireAuth)
  .get(
    "/",
    async ({ user, request }: CalendarsContext) => {
      const authenticatedUser = await ensureAuthenticatedUser(
        user,
        request,
      );

      // Ensure user has default calendars
      await ensureUserCalendars(authenticatedUser.id);

      const calendars = await prisma.calendar.findMany({
        where: {
          userId: authenticatedUser.id,
        },
        orderBy: [
          { isDefault: "desc" }, // Default calendar first
          { name: "asc" },
        ],
      });

      return { calendars };
    },
    {
      detail: {
        tags: ["Calendars"],
        summary: "Get user's calendars",
        description:
          "Fetches all calendars belonging to the authenticated user",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Calendars retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    calendars: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          name: { type: "string" },
                          color: { type: "string" },
                          isVisible: { type: "boolean" },
                          isDefault: { type: "boolean" },
                          createdAt: { type: "string", format: "date-time" },
                          updatedAt: { type: "string", format: "date-time" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          401: {
            description: "Unauthorized",
          },
        },
      },
    },
  )

  .post(
    "/",
    async ({
      body,
      user,
      request,
    }: CalendarsContext<Record<string, never>, CreateCalendarBody>) => {
      const authenticatedUser = await ensureAuthenticatedUser(
        user,
        request,
      );
      const typedBody = body as CreateCalendarBody;

      const { name, color, isDefault } = typedBody;

      // Validate required fields
      if (!name?.trim()) {
        throw new ValidationError(
          "Calendar name is required and cannot be empty",
          "name",
        );
      }

      // Validate color (allow predefined colors or hex colors)
      if (!isValidCalendarColor(color)) {
        throw new ValidationError(
          `Color must be one of: ${ALLOWED_CALENDAR_COLORS.join(", ")} or a valid hex color (e.g., #FF0000)`,
          "color",
        );
      }

      // Validate name length
      if (name.trim().length > 100) {
        throw new ValidationError(
          "Calendar name cannot exceed 100 characters",
          "name",
        );
      }

      // Check if calendar name already exists for this user
      const existingCalendar = await prisma.calendar.findFirst({
        where: {
          userId: authenticatedUser.id,
          name: name.trim(),
        },
      });

      if (existingCalendar) {
        throw new ValidationError(
          "A calendar with this name already exists",
          "name",
        );
      }

      // If this is being set as default, unset other defaults
      if (isDefault) {
        await prisma.calendar.updateMany({
          where: {
            userId: authenticatedUser.id,
            isDefault: true,
          },
          data: {
            isDefault: false,
          },
        });
      }

      // Create the calendar
      const calendar = await prisma.calendar.create({
        data: {
          name: name.trim(),
          color,
          kind: "owned",
          isPublic: false,
          isVisible: true,
          isDefault: isDefault || false,
          userId: authenticatedUser.id,
        },
      });

      return calendar;
    },
    {
      body: createCalendarBodySchema,
      detail: {
        tags: ["Calendars"],
        summary: "Create a new calendar",
        description: "Creates a new calendar for the authenticated user",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Calendar created successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    color: { type: "string" },
                    isVisible: { type: "boolean" },
                    isDefault: { type: "boolean" },
                    createdAt: { type: "string", format: "date-time" },
                    updatedAt: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          400: {
            description: "Validation error",
          },
          401: {
            description: "Unauthorized",
          },
        },
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
    }: CalendarsContext<UpdateCalendarParams, UpdateCalendarBody>) => {
      const authenticatedUser = await ensureAuthenticatedUser(
        user,
        request,
      );
      const typedParams = params as UpdateCalendarParams;
      const typedBody = body as UpdateCalendarBody;

      const { id } = typedParams;

      // Verify calendar exists and belongs to user
      const existingCalendar = await prisma.calendar.findFirst({
        where: {
          id,
          userId: authenticatedUser.id,
        },
      });

      if (!existingCalendar) {
        throw new ValidationError("Calendar not found or access denied");
      }

      const isVisibilityOnlyUpdate =
        typedBody.isVisible !== undefined &&
        typedBody.name === undefined &&
        typedBody.color === undefined &&
        typedBody.isDefault === undefined;

      if (existingCalendar.kind !== "owned" && !isVisibilityOnlyUpdate) {
        throw new ValidationError(
          "Only owned calendars can be updated here. Manage subscribed or public calendars from subscriptions instead.",
        );
      }

      // Validate name if provided
      if (typedBody.name !== undefined) {
        if (!typedBody.name?.trim()) {
          throw new ValidationError(
            "Calendar name is required and cannot be empty",
            "name",
          );
        }
        if (typedBody.name.trim().length > 100) {
          throw new ValidationError(
            "Calendar name cannot exceed 100 characters",
            "name",
          );
        }

        // Check if calendar name already exists for this user (excluding current calendar)
        const existingNameCalendar = await prisma.calendar.findFirst({
          where: {
            userId: authenticatedUser.id,
            name: typedBody.name.trim(),
            id: { not: id },
          },
        });

        if (existingNameCalendar) {
          throw new ValidationError(
            "A calendar with this name already exists",
            "name",
          );
        }
      }

      // Validate color if provided (allow predefined colors or hex colors)
      if (typedBody.color !== undefined) {
        if (!isValidCalendarColor(typedBody.color)) {
          throw new ValidationError(
            `Color must be one of: ${ALLOWED_CALENDAR_COLORS.join(", ")} or a valid hex color (e.g., #FF0000)`,
            "color",
          );
        }
      }

      // Prepare update data
      const updateData: Prisma.CalendarUpdateInput = {};

      if (typedBody.name !== undefined) {
        updateData.name = typedBody.name.trim();
      }
      if (typedBody.color !== undefined) {
        updateData.color = typedBody.color;
      }
      if (typedBody.isVisible !== undefined) {
        updateData.isVisible = typedBody.isVisible;
      }
      if (typedBody.isDefault !== undefined) {
        updateData.isDefault = typedBody.isDefault;

        // If setting as default, unset other defaults
        if (typedBody.isDefault) {
          await prisma.calendar.updateMany({
            where: {
              userId: authenticatedUser.id,
              isDefault: true,
              id: { not: id },
            },
            data: {
              isDefault: false,
            },
          });
        }
      }

      updateData.updatedAt = new Date();

      // Update the calendar
      const updatedCalendar = await prisma.calendar.update({
        where: { id },
        data: updateData,
      });

      return updatedCalendar;
    },
    {
      params: updateCalendarParamsSchema,
      body: updateCalendarBodySchema,
      detail: {
        tags: ["Calendars"],
        summary: "Update an existing calendar",
        description: "Updates an existing calendar with ownership verification",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Calendar updated successfully",
          },
          400: {
            description: "Validation error",
          },
          401: {
            description: "Unauthorized",
          },
          404: {
            description: "Calendar not found",
          },
        },
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
    }: CalendarsContext<DeleteCalendarParams, unknown, DeleteCalendarQuery>) => {
      const authenticatedUser = await ensureAuthenticatedUser(
        user,
        request,
      );
      const typedParams = params as DeleteCalendarParams;
      const typedQuery = query as DeleteCalendarQuery;

      const { id } = typedParams;
      const { action = "delete_events", targetCalendarId } = typedQuery;

      // Verify calendar exists and belongs to user
      const existingCalendar = await prisma.calendar.findFirst({
        where: {
          id,
          userId: authenticatedUser.id,
        },
      });

      if (!existingCalendar) {
        throw new ValidationError("Calendar not found or access denied");
      }

      if (existingCalendar.kind !== "owned") {
        throw new ValidationError(
          "Only owned calendars can be deleted here. Manage subscribed or public calendars from subscriptions instead.",
        );
      }

      // Prevent deleting the last owned calendar
      const calendarCount = await prisma.calendar.count({
        where: {
          userId: authenticatedUser.id,
          kind: "owned",
        },
      });

      if (calendarCount <= 1) {
        throw new ValidationError(
          "Cannot delete the last editable calendar. Create another calendar first.",
          "calendarId",
        );
      }

      // Check if calendar has events and delete them automatically
      const events = await prisma.calendarEvent.findMany({
        where: {
          calendarId: id,
        },
      });

      if (events.length > 0) {
        if (action === "move_events") {
          if (!targetCalendarId) {
            throw new ValidationError(
              "Target calendar ID is required when moving events",
              "targetCalendarId",
            );
          }

          // Verify target calendar exists and belongs to user
          const targetCalendar = await prisma.calendar.findFirst({
            where: {
              id: targetCalendarId,
              userId: authenticatedUser.id,
            },
          });

          if (!targetCalendar) {
            throw new ValidationError(
              "Target calendar not found or access denied",
              "targetCalendarId",
            );
          }

          if (targetCalendarId === id) {
            throw new ValidationError(
              "Cannot move events to the same calendar being deleted",
              "targetCalendarId",
            );
          }

          // Move all events to target calendar
          await prisma.calendarEvent.updateMany({
            where: {
              calendarId: id,
            },
            data: {
              calendarId: targetCalendarId,
              updatedAt: new Date(),
            },
          });
        } else {
          // Default behavior: delete all events in the calendar
          await prisma.calendarEvent.deleteMany({
            where: {
              calendarId: id,
            },
          });
        }
      }

      // If this was the default calendar, set another calendar as default
      if (existingCalendar.isDefault) {
        const nextCalendar = await prisma.calendar.findFirst({
          where: {
            userId: authenticatedUser.id,
            id: { not: id },
          },
          orderBy: {
            createdAt: "asc",
          },
        });

        if (nextCalendar) {
          await prisma.calendar.update({
            where: { id: nextCalendar.id },
            data: { isDefault: true },
          });
        }
      }

      // Delete the calendar
      await prisma.calendar.delete({
        where: { id },
      });

      return {
        success: true,
        message:
          action === "move_events"
            ? `Calendar deleted successfully. ${events.length} events moved to target calendar.`
            : events.length > 0
              ? `Calendar deleted successfully. ${events.length} events were also deleted.`
              : "Calendar deleted successfully.",
        deletedCalendarId: id,
        eventsAffected: events.length,
        action: action || "delete_events",
      };
    },
    {
      params: deleteCalendarParamsSchema,
      query: deleteCalendarQuerySchema,
      detail: {
        tags: ["Calendars"],
        summary: "Delete a calendar with event handling options",
        description: `Deletes a calendar with options for handling existing events:
        - delete_events: (default) Delete calendar and all its events
        - move_events: Move all events to another calendar (requires targetCalendarId)`,
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Calendar deleted successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    message: { type: "string" },
                    deletedCalendarId: { type: "string" },
                    eventsAffected: { type: "number" },
                    action: { type: "string" },
                  },
                },
              },
            },
          },
          400: {
            description: "Validation error",
          },
          401: {
            description: "Unauthorized",
          },
          404: {
            description: "Calendar not found",
          },
        },
      },
    },
  );
