import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { ValidationError } from "../lib/errors";
import { ensureUserCalendars } from "../lib/user-setup";

export const calendarsRoutes = new Elysia({ prefix: "/calendars" })
  .get(
    "/",
    async ({ user }: any) => {
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
      auth: true,
      detail: {
        tags: ["Calendars"],
        summary: "Get user's calendars",
        description: "Fetches all calendars belonging to the authenticated user",
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
    }
  )

  .post(
    "/",
    async ({ body, user }: any) => {
      const { name, color, isDefault } = body;

      // Validate required fields
      if (!name?.trim()) {
        throw new ValidationError(
          "Calendar name is required and cannot be empty",
          "name"
        );
      }

      // Validate color
      const allowedColors = ["blue", "orange", "violet", "rose", "emerald"];
      if (!allowedColors.includes(color)) {
        throw new ValidationError(
          `Color must be one of: ${allowedColors.join(", ")}`,
          "color"
        );
      }

      // Validate name length
      if (name.trim().length > 100) {
        throw new ValidationError(
          "Calendar name cannot exceed 100 characters",
          "name"
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
          "name"
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
      auth: true,
      body: t.Object({
        name: t.String({
          minLength: 1,
          maxLength: 100,
          description: "Calendar name (required, 1-100 characters)",
        }),
        color: t.String({
          description: "Calendar color (blue, orange, violet, rose, emerald)",
        }),
        isDefault: t.Optional(
          t.Boolean({
            description: "Whether this should be the default calendar (default: false)",
          })
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
    }
  )

  .put(
    "/:id",
    async ({ params, body, user }: any) => {
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
            "name"
          );
        }
        if (body.name.trim().length > 100) {
          throw new ValidationError(
            "Calendar name cannot exceed 100 characters",
            "name"
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
            "name"
          );
        }
      }

      // Validate color if provided
      if (body.color !== undefined) {
        const allowedColors = ["blue", "orange", "violet", "rose", "emerald"];
        if (!allowedColors.includes(body.color)) {
          throw new ValidationError(
            `Color must be one of: ${allowedColors.join(", ")}`,
            "color"
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
      auth: true,
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
          })
        ),
        color: t.Optional(
          t.String({
            description: "Calendar color (blue, orange, violet, rose, emerald)",
          })
        ),
        isVisible: t.Optional(
          t.Boolean({
            description: "Whether the calendar is visible",
          })
        ),
        isDefault: t.Optional(
          t.Boolean({
            description: "Whether this should be the default calendar",
          })
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
    }
  )

  .delete(
    "/:id",
    async ({ params, user }: any) => {
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

      // Check if calendar has events
      const eventCount = await prisma.calendarEvent.count({
        where: {
          calendarId: id,
        },
      });

      if (eventCount > 0) {
        throw new ValidationError(
          "Cannot delete calendar that contains events. Please move or delete all events first.",
          "calendarId"
        );
      }

      // Delete the calendar
      await prisma.calendar.delete({
        where: { id },
      });

      return {
        success: true,
        message: "Calendar deleted successfully",
        deletedCalendarId: id,
      };
    },
    {
      auth: true,
      params: t.Object({
        id: t.String({
          description: "Calendar ID to delete",
        }),
      }),
      detail: {
        tags: ["Calendars"],
        summary: "Delete a calendar",
        description: "Deletes a calendar with proper user ownership verification. Calendar must be empty (no events).",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Calendar deleted successfully",
          },
          400: {
            description: "Validation error (e.g., calendar contains events)",
          },
          401: {
            description: "Unauthorized",
          },
          404: {
            description: "Calendar not found",
          },
        },
      },
    }
  );