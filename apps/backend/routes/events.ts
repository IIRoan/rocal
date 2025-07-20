import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { ValidationError } from "../lib/errors";

export const eventsRoutes = new Elysia({ prefix: "/events" })
  .get(
    "/",
    async ({ query, user }: any) => {
      const { start, end } = query;

      // Validate required parameters
      if (!start || !end) {
        throw new ValidationError("Start and end date parameters are required");
      }

      // Parse and validate dates
      const startDate = new Date(start as string);
      const endDate = new Date(end as string);

      if (isNaN(startDate.getTime())) {
        throw new ValidationError(
          "Invalid start date format. Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)"
        );
      }

      if (isNaN(endDate.getTime())) {
        throw new ValidationError(
          "Invalid end date format. Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)"
        );
      }

      if (startDate >= endDate) {
        throw new ValidationError("End date must be after start date");
      }

      // Fetch events within date range
      const events = await prisma.calendarEvent.findMany({
        where: {
          userId: user.id,
          OR: [
            // Events that start within the range
            {
              start: { gte: startDate, lte: endDate },
            },
            // Events that end within the range
            {
              end: { gte: startDate, lte: endDate },
            },
            // Events that span the entire range
            {
              start: { lte: startDate },
              end: { gte: endDate },
            },
          ],
        },
        include: {
          category: true,
        },
        orderBy: { start: "asc" },
      });

      // Fetch user's categories for efficient frontend rendering
      const categories = await prisma.eventCategory.findMany({
        where: {
          userId: user.id,
          isActive: true,
        },
        orderBy: { name: "asc" },
      });

      return {
        events,
        categories,
      };
    },
    {
      auth: true,
      query: t.Object({
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
        responses: {
          200: {
            description: "Events and categories retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    events: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          title: { type: "string" },
                          description: { type: "string", nullable: true },
                          start: { type: "string", format: "date-time" },
                          end: { type: "string", format: "date-time" },
                          allDay: { type: "boolean" },
                          location: { type: "string", nullable: true },
                          color: { type: "string", nullable: true },
                          categoryId: { type: "string", nullable: true },
                          category: {
                            type: "object",
                            nullable: true,
                            properties: {
                              id: { type: "string" },
                              name: { type: "string" },
                              color: { type: "string" },
                            },
                          },
                        },
                      },
                    },
                    categories: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          name: { type: "string" },
                          color: { type: "string" },
                          isActive: { type: "boolean" },
                        },
                      },
                    },
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

  .post(
    "/",
    async ({ body, user }: any) => {
      const { title, start, end } = body;

      // Validate required fields
      if (!title?.trim()) {
        throw new ValidationError(
          "Title is required and cannot be empty",
          "title"
        );
      }

      if (!start) {
        throw new ValidationError("Start date is required", "start");
      }

      if (!end) {
        throw new ValidationError("End date is required", "end");
      }

      // Parse and validate dates
      const startDate = new Date(start);
      const endDate = new Date(end);

      if (isNaN(startDate.getTime())) {
        throw new ValidationError(
          "Invalid start date format. Use ISO 8601 format",
          "start"
        );
      }

      if (isNaN(endDate.getTime())) {
        throw new ValidationError(
          "Invalid end date format. Use ISO 8601 format",
          "end"
        );
      }

      if (startDate >= endDate) {
        throw new ValidationError("End time must be after start time", "end");
      }

      // Validate color if provided
      if (body.color) {
        const allowedColors = ["blue", "orange", "violet", "rose", "emerald"];
        if (!allowedColors.includes(body.color)) {
          throw new ValidationError(
            `Color must be one of: ${allowedColors.join(", ")}`,
            "color"
          );
        }
      }

      // Validate category exists and belongs to user if provided
      if (body.categoryId) {
        const category = await prisma.eventCategory.findFirst({
          where: {
            id: body.categoryId,
            userId: user.id,
            isActive: true,
          },
        });

        if (!category) {
          throw new ValidationError(
            "Invalid category or category does not belong to user",
            "categoryId"
          );
        }
      }

      // Validate title length
      if (title.trim().length > 255) {
        throw new ValidationError(
          "Title cannot exceed 255 characters",
          "title"
        );
      }

      // Validate description length if provided
      if (body.description && body.description.length > 1000) {
        throw new ValidationError(
          "Description cannot exceed 1000 characters",
          "description"
        );
      }

      // Validate location length if provided
      if (body.location && body.location.length > 255) {
        throw new ValidationError(
          "Location cannot exceed 255 characters",
          "location"
        );
      }

      // Create the event
      const event = await prisma.calendarEvent.create({
        data: {
          title: title.trim(),
          description: body.description?.trim() || null,
          start: startDate,
          end: endDate,
          allDay: body.allDay || false,
          location: body.location?.trim() || null,
          color: body.color || null,
          categoryId: body.categoryId || null,
          userId: user.id,
        },
        include: {
          category: true,
        },
      });

      return event;
    },
    {
      auth: true,
      body: t.Object({
        title: t.String({
          minLength: 1,
          maxLength: 255,
          description: "Event title (required, 1-255 characters)",
        }),
        description: t.Optional(
          t.String({
            maxLength: 1000,
            description: "Event description (optional, max 1000 characters)",
          })
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
          })
        ),
        location: t.Optional(
          t.String({
            maxLength: 255,
            description: "Event location (optional, max 255 characters)",
          })
        ),
        color: t.Optional(
          t.String({
            description: "Event color (blue, orange, violet, rose, emerald)",
          })
        ),
        categoryId: t.Optional(
          t.String({
            description: "ID of the event category (must belong to user)",
          })
        ),
      }),
      detail: {
        tags: ["Events"],
        summary: "Create a new calendar event",
        description:
          "Creates a new calendar event for the authenticated user with proper validation",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Event created successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    title: { type: "string" },
                    description: { type: "string", nullable: true },
                    start: { type: "string", format: "date-time" },
                    end: { type: "string", format: "date-time" },
                    allDay: { type: "boolean" },
                    location: { type: "string", nullable: true },
                    color: { type: "string", nullable: true },
                    categoryId: { type: "string", nullable: true },
                    category: {
                      type: "object",
                      nullable: true,
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        color: { type: "string" },
                      },
                    },
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

      // Verify event exists and belongs to user
      const existingEvent = await prisma.calendarEvent.findFirst({
        where: {
          id,
          userId: user.id,
        },
        include: { category: true },
      });

      if (!existingEvent) {
        throw new ValidationError("Event not found or access denied");
      }

      // Validate dates if provided
      let startDate: Date | undefined;
      let endDate: Date | undefined;

      if (body.start) {
        startDate = new Date(body.start);
        if (isNaN(startDate.getTime())) {
          throw new ValidationError(
            "Invalid start date format. Use ISO 8601 format",
            "start"
          );
        }
      }

      if (body.end) {
        endDate = new Date(body.end);
        if (isNaN(endDate.getTime())) {
          throw new ValidationError(
            "Invalid end date format. Use ISO 8601 format",
            "end"
          );
        }
      }

      // Use existing dates if not provided in update
      const finalStartDate = startDate || existingEvent.start;
      const finalEndDate = endDate || existingEvent.end;

      // Validate date logic
      if (finalStartDate >= finalEndDate) {
        throw new ValidationError("End time must be after start time", "end");
      }

      // Validate title if provided
      if (body.title !== undefined) {
        if (!body.title?.trim()) {
          throw new ValidationError(
            "Title is required and cannot be empty",
            "title"
          );
        }
        if (body.title.trim().length > 255) {
          throw new ValidationError(
            "Title cannot exceed 255 characters",
            "title"
          );
        }
      }

      // Validate description length if provided
      if (
        body.description !== undefined &&
        body.description &&
        body.description.length > 1000
      ) {
        throw new ValidationError(
          "Description cannot exceed 1000 characters",
          "description"
        );
      }

      // Validate location length if provided
      if (
        body.location !== undefined &&
        body.location &&
        body.location.length > 255
      ) {
        throw new ValidationError(
          "Location cannot exceed 255 characters",
          "location"
        );
      }

      // Validate color if provided
      if (body.color !== undefined && body.color) {
        const allowedColors = ["blue", "orange", "violet", "rose", "emerald"];
        if (!allowedColors.includes(body.color)) {
          throw new ValidationError(
            `Color must be one of: ${allowedColors.join(", ")}`,
            "color"
          );
        }
      }

      // Validate category exists and belongs to user if provided
      if (body.categoryId !== undefined && body.categoryId) {
        const category = await prisma.eventCategory.findFirst({
          where: {
            id: body.categoryId,
            userId: user.id,
            isActive: true,
          },
        });

        if (!category) {
          throw new ValidationError(
            "Invalid category or category does not belong to user",
            "categoryId"
          );
        }
      }

      // Prepare update data (only include fields that are provided)
      const updateData: any = {};

      if (body.title !== undefined) {
        updateData.title = body.title.trim();
      }
      if (body.description !== undefined) {
        updateData.description = body.description?.trim() || null;
      }
      if (startDate) {
        updateData.start = startDate;
      }
      if (endDate) {
        updateData.end = endDate;
      }
      if (body.allDay !== undefined) {
        updateData.allDay = body.allDay;
      }
      if (body.location !== undefined) {
        updateData.location = body.location?.trim() || null;
      }
      if (body.color !== undefined) {
        updateData.color = body.color || null;
      }
      if (body.categoryId !== undefined) {
        updateData.categoryId = body.categoryId || null;
      }

      // Add updatedAt for optimistic locking check
      updateData.updatedAt = new Date();

      // Update the event with optimistic locking
      try {
        const updatedEvent = await prisma.calendarEvent.update({
          where: {
            id,
            // Optimistic locking: ensure the event hasn't been modified since we fetched it
            updatedAt: existingEvent.updatedAt,
          },
          data: updateData,
          include: {
            category: true,
          },
        });

        return updatedEvent;
      } catch (error: any) {
        // Handle optimistic locking conflict
        if (
          error.code === "P2025" ||
          error.message.includes("Record to update not found")
        ) {
          throw new ValidationError(
            "Event was modified by another process. Please refresh and try again."
          );
        }
        throw error;
      }
    },
    {
      auth: true,
      params: t.Object({
        id: t.String({
          description: "Event ID",
        }),
      }),
      body: t.Object({
        title: t.Optional(
          t.String({
            minLength: 1,
            maxLength: 255,
            description: "Event title (1-255 characters)",
          })
        ),
        description: t.Optional(
          t.String({
            maxLength: 1000,
            description: "Event description (max 1000 characters)",
          })
        ),
        start: t.Optional(
          t.String({
            description: "Start date in ISO 8601 format",
          })
        ),
        end: t.Optional(
          t.String({
            description: "End date in ISO 8601 format",
          })
        ),
        allDay: t.Optional(
          t.Boolean({
            description: "Whether the event is all-day",
          })
        ),
        location: t.Optional(
          t.String({
            maxLength: 255,
            description: "Event location (max 255 characters)",
          })
        ),
        color: t.Optional(
          t.String({
            description: "Event color (blue, orange, violet, rose, emerald)",
          })
        ),
        categoryId: t.Optional(
          t.String({
            description: "ID of the event category (must belong to user)",
          })
        ),
      }),
      detail: {
        tags: ["Events"],
        summary: "Update an existing calendar event",
        description:
          "Updates an existing calendar event with ownership verification and optimistic locking to prevent concurrent update conflicts",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Event updated successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    title: { type: "string" },
                    description: { type: "string", nullable: true },
                    start: { type: "string", format: "date-time" },
                    end: { type: "string", format: "date-time" },
                    allDay: { type: "boolean" },
                    location: { type: "string", nullable: true },
                    color: { type: "string", nullable: true },
                    categoryId: { type: "string", nullable: true },
                    category: {
                      type: "object",
                      nullable: true,
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        color: { type: "string" },
                      },
                    },
                    updatedAt: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          400: {
            description: "Validation error or optimistic locking conflict",
          },
          401: {
            description: "Unauthorized",
          },
          404: {
            description: "Event not found",
          },
        },
      },
    }
  )

  .delete(
    "/:id",
    async ({ params, user }: any) => {
      const { id } = params;

      // Verify event exists and belongs to user
      const existingEvent = await prisma.calendarEvent.findFirst({
        where: {
          id,
          userId: user.id,
        },
      });

      if (!existingEvent) {
        throw new ValidationError("Event not found or access denied");
      }

      // For now, we'll do hard delete, but we could implement soft delete
      // by adding a 'deletedAt' field to the schema for future audit requirements
      await prisma.calendarEvent.delete({
        where: { id },
      });

      return {
        success: true,
        message: "Event deleted successfully",
        deletedEventId: id,
      };
    },
    {
      auth: true,
      params: t.Object({
        id: t.String({
          description: "Event ID to delete",
        }),
      }),
      detail: {
        tags: ["Events"],
        summary: "Delete a calendar event",
        description:
          "Deletes a calendar event with proper user ownership verification",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Event deleted successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    message: { type: "string" },
                    deletedEventId: { type: "string" },
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
            description: "Event not found",
          },
        },
      },
    }
  );
