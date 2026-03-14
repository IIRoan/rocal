import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { ValidationError } from "../lib/errors";
import { ensureUserCalendars } from "../lib/user-setup";
import { requireAuth } from "../lib/auth-guard";

import { auth } from "../lib/auth";
import { ensureAuthenticatedUser } from "../lib/auth-utils";

export const calendarsRoutes = new Elysia({ prefix: "/calendars" })
  .use(requireAuth)
  .get(
    "/",
    async ({ user, request }: any) => {
      user = await ensureAuthenticatedUser(user, request as Request);

      // Ensure user has default calendars
      await ensureUserCalendars(user.id);

      const calendars = await prisma.calendar.findMany({
        where: {
          userId: user.id,
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
    async ({ body, user, request }: any) => {
      user = await ensureAuthenticatedUser(user, request as Request);

      const { name, color, isDefault } = body;

      // Validate required fields
      if (!name?.trim()) {
        throw new ValidationError(
          "Calendar name is required and cannot be empty",
          "name",
        );
      }

      // Validate color (allow predefined colors or hex colors)
      const allowedColors = ["blue", "orange", "violet", "rose", "emerald"];
      const isHexColor = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);

      if (!allowedColors.includes(color) && !isHexColor) {
        throw new ValidationError(
          `Color must be one of: ${allowedColors.join(", ")} or a valid hex color (e.g., #FF0000)`,
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
          userId: user.id,
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
            userId: user.id,
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
          isVisible: true,
          isDefault: isDefault || false,
          userId: user.id,
        },
      });

      return calendar;
    },
    {
      body: t.Object({
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
      }),
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
    async ({ params, body, user, request }: any) => {
      user = await ensureAuthenticatedUser(user, request as Request);

      const { id } = params;

      // Verify calendar exists and belongs to user
      const existingCalendar = await prisma.calendar.findFirst({
        where: {
          id,
          userId: user.id,
        },
      });

      if (!existingCalendar) {
        throw new ValidationError("Calendar not found or access denied");
      }

      // Validate name if provided
      if (body.name !== undefined) {
        if (!body.name?.trim()) {
          throw new ValidationError(
            "Calendar name is required and cannot be empty",
            "name",
          );
        }
        if (body.name.trim().length > 100) {
          throw new ValidationError(
            "Calendar name cannot exceed 100 characters",
            "name",
          );
        }

        // Check if calendar name already exists for this user (excluding current calendar)
        const existingNameCalendar = await prisma.calendar.findFirst({
          where: {
            userId: user.id,
            name: body.name.trim(),
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
      if (body.color !== undefined) {
        const allowedColors = ["blue", "orange", "violet", "rose", "emerald"];
        const isHexColor = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(
          body.color,
        );

        if (!allowedColors.includes(body.color) && !isHexColor) {
          throw new ValidationError(
            `Color must be one of: ${allowedColors.join(", ")} or a valid hex color (e.g., #FF0000)`,
            "color",
          );
        }
      }

      // Prepare update data
      const updateData: any = {};

      if (body.name !== undefined) {
        updateData.name = body.name.trim();
      }
      if (body.color !== undefined) {
        updateData.color = body.color;
      }
      if (body.isVisible !== undefined) {
        updateData.isVisible = body.isVisible;
      }
      if (body.isDefault !== undefined) {
        updateData.isDefault = body.isDefault;

        // If setting as default, unset other defaults
        if (body.isDefault) {
          await prisma.calendar.updateMany({
            where: {
              userId: user.id,
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
      params: t.Object({
        id: t.String({
          description: "Calendar ID",
        }),
      }),
      body: t.Object({
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
      }),
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
    async ({ params, query, user, request }: any) => {
      user = await ensureAuthenticatedUser(user, request as Request);

      const { id } = params;
      const { action = "delete_events", targetCalendarId } = query;

      // Verify calendar exists and belongs to user
      const existingCalendar = await prisma.calendar.findFirst({
        where: {
          id,
          userId: user.id,
        },
      });

      if (!existingCalendar) {
        throw new ValidationError("Calendar not found or access denied");
      }

      // Prevent deleting the last calendar
      const calendarCount = await prisma.calendar.count({
        where: {
          userId: user.id,
        },
      });

      if (calendarCount <= 1) {
        throw new ValidationError(
          "Cannot delete the last calendar. Create another calendar first.",
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
              userId: user.id,
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
            userId: user.id,
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
      params: t.Object({
        id: t.String({
          description: "Calendar ID to delete",
        }),
      }),
      query: t.Object({
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
      }),
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
