import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { ValidationError } from "../lib/errors";
import { ensureUserCalendars } from "../lib/user-setup";
import { RecurrenceEngine } from "../lib/recurrence";
import { notificationService } from "../lib/notification-service";

export const eventsRoutes = new Elysia({ prefix: "/events" })
  .get(
    "/",
    async ({ query, user }: any) => {
      const { start, end } = query;

      // Ensure user has default calendars
      await ensureUserCalendars(user.id);

      // Validate required parameters
      if (!start || !end) {
        throw new ValidationError("Start and end date parameters are required");
      }

      // Parse and validate dates
      const startDate = new Date(start as string);
      const endDate = new Date(end as string);

      if (isNaN(startDate.getTime())) {
        throw new ValidationError(
          "Invalid start date format. Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)",
        );
      }

      if (isNaN(endDate.getTime())) {
        throw new ValidationError(
          "Invalid end date format. Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)",
        );
      }

      if (startDate >= endDate) {
        throw new ValidationError("End date must be after start date");
      }

      // Fetch regular (non-recurring) events within date range
      const regularEvents = await prisma.calendarEvent.findMany({
        where: {
          userId: user.id,
          recurrence: null,
          OR: [
            {
              start: { gte: startDate, lte: endDate },
            },
            {
              end: { gte: startDate, lte: endDate },
            },
            {
              start: { lte: startDate },
              end: { gte: endDate },
            },
          ],
        },
        include: {
          category: true,
          calendar: true,
        },
      });

      // Fetch recurring events (parent events)
      const recurringEvents = await prisma.calendarEvent.findMany({
        where: {
          userId: user.id,
          recurrence: { not: null },
          parentEventId: null, // Only get parent events, not instances
        },
        include: {
          category: true,
          calendar: true,
          recurrenceExceptions: true,
        },
      });

      // Generate recurring event instances
      const recurringInstances = [];
      for (const recurringEvent of recurringEvents) {
        try {
          const exceptions = recurringEvent.recurrenceExceptions.map((ex) => ({
            exceptionDate: ex.exceptionDate,
            type: ex.type as "modified" | "deleted",
          }));

          const instances = RecurrenceEngine.generateInstances(
            {
              id: recurringEvent.id,
              start: recurringEvent.start,
              end: recurringEvent.end,
              recurrence: recurringEvent.recurrence!,
            },
            startDate,
            endDate,
            exceptions,
          );

          // Convert instances to events
          for (const instance of instances) {
            if (!instance.isOriginal) {
              const duration =
                recurringEvent.end.getTime() - recurringEvent.start.getTime();
              recurringInstances.push({
                ...recurringEvent,
                id: `${recurringEvent.id}_${instance.date.toISOString()}`,
                start: instance.date,
                end: new Date(instance.date.getTime() + duration),
                parentEventId: recurringEvent.id,
                isRecurringInstance: true,
              });
            } else if (
              instance.isOriginal &&
              instance.date >= startDate &&
              instance.date <= endDate
            ) {
              // Include original event if it falls within range
              recurringInstances.push({
                ...recurringEvent,
                isRecurringInstance: false,
              });
            }
          }
        } catch (error) {
          console.error(
            `Error generating instances for event ${recurringEvent.id}:`,
            error,
          );
          // If recurrence generation fails, include the original event
          if (
            recurringEvent.start >= startDate &&
            recurringEvent.start <= endDate
          ) {
            recurringInstances.push({
              ...recurringEvent,
              isRecurringInstance: false,
            });
          }
        }
      }

      // Fetch modified recurring event instances
      const modifiedInstances = await prisma.calendarEvent.findMany({
        where: {
          userId: user.id,
          parentEventId: { not: null },
          start: { gte: startDate, lte: endDate },
        },
        include: {
          category: true,
          calendar: true,
        },
      });

      // Combine all events
      const events = [
        ...regularEvents,
        ...recurringInstances,
        ...modifiedInstances,
      ].sort((a, b) => a.start.getTime() - b.start.getTime());

      // Fetch user's categories for efficient frontend rendering
      const categories = await prisma.eventCategory.findMany({
        where: {
          userId: user.id,
          isActive: true,
        },
        orderBy: { name: "asc" },
      });

      // Fetch user's calendars for efficient frontend rendering
      const calendars = await prisma.calendar.findMany({
        where: {
          userId: user.id,
        },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      });

      return {
        events,
        categories,
        calendars,
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
    },
  )

  .post(
    "/",
    async ({ body, user }: any) => {
      try {
        const { title, start, end } = body;

        // Validate required fields
        if (!title?.trim()) {
          throw new ValidationError(
            "Title is required and cannot be empty",
            "title",
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
            "start",
          );
        }

        if (isNaN(endDate.getTime())) {
          throw new ValidationError(
            "Invalid end date format. Use ISO 8601 format",
            "end",
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
              "color",
            );
          }
        }

        // Validate recurrence rule if provided
        if (body.recurrence) {
          try {
            const rule = RecurrenceEngine.parseRecurrenceRule(body.recurrence);
            if (!rule) {
              throw new ValidationError(
                "Invalid recurrence rule format",
                "recurrence",
              );
            }

            const errors = RecurrenceEngine.validateRecurrenceRule(rule);
            if (errors.length > 0) {
              throw new ValidationError(
                `Recurrence rule validation failed: ${errors.join(", ")}`,
                "recurrence",
              );
            }
          } catch (recurrenceError) {
            console.error("Recurrence validation error:", recurrenceError);
            throw new ValidationError(
              "Invalid recurrence rule format",
              "recurrence",
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
              "categoryId",
            );
          }
        }

        // Validate title length
        if (title.trim().length > 255) {
          throw new ValidationError(
            "Title cannot exceed 255 characters",
            "title",
          );
        }

        // Validate description length if provided
        if (body.description && body.description.length > 1000) {
          throw new ValidationError(
            "Description cannot exceed 1000 characters",
            "description",
          );
        }

        // Validate location length if provided
        if (body.location && body.location.length > 255) {
          throw new ValidationError(
            "Location cannot exceed 255 characters",
            "location",
          );
        }

        // Validate calendar exists and belongs to user
        if (!body.calendarId) {
          throw new ValidationError("Calendar ID is required", "calendarId");
        }

        const calendar = await prisma.calendar.findFirst({
          where: {
            id: body.calendarId,
            userId: user.id,
          },
        });

        if (!calendar) {
          throw new ValidationError(
            "Invalid calendar or calendar does not belong to user",
            "calendarId",
          );
        }

        // Validate reminder if provided (must be a non-negative number)
        if (body.reminder !== undefined && body.reminder !== null) {
          const reminderValue = Number(body.reminder);
          if (
            isNaN(reminderValue) ||
            reminderValue < 0 ||
            reminderValue > 43200
          ) {
            throw new ValidationError(
              "Reminder must be a number between 0 and 43200 minutes",
              "reminder",
            );
          }
          body.reminder = reminderValue;
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
            calendarId: body.calendarId,
            categoryId: body.categoryId || null,
            reminder: body.reminder || null,
            recurrence: body.recurrence || null,
            userId: user.id,
          },
          include: {
            category: true,
            calendar: true,
          },
        });

        // Create default notifications for the new event
        try {
          await notificationService.createDefaultNotificationsForEvent(
            event.id,
            user.id,
            body.reminder,
          );
        } catch (notificationError) {
          console.error(
            "Failed to create default notifications:",
            notificationError,
          );
          // Don't fail the event creation if notifications fail
        }

        return event;
      } catch (error) {
        console.error("Event creation error:", error);
        throw error;
      }
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
        reminder: t.Optional(
          t.Union([
            t.Number({
              minimum: 0,
              maximum: 43200, // 30 days in minutes
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
    },
  )

  .put(
    "/:id",
    async ({ params, body, user }: any) => {
      try {
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
              "start",
            );
          }
        }

        if (body.end) {
          endDate = new Date(body.end);
          if (isNaN(endDate.getTime())) {
            throw new ValidationError(
              "Invalid end date format. Use ISO 8601 format",
              "end",
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
              "title",
            );
          }
          if (body.title.trim().length > 255) {
            throw new ValidationError(
              "Title cannot exceed 255 characters",
              "title",
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
            "description",
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
            "location",
          );
        }

        // Validate color if provided
        if (body.color !== undefined && body.color) {
          const allowedColors = ["blue", "orange", "violet", "rose", "emerald"];
          if (!allowedColors.includes(body.color)) {
            throw new ValidationError(
              `Color must be one of: ${allowedColors.join(", ")}`,
              "color",
            );
          }
        }

        // Validate calendar exists and belongs to user if provided
        if (body.calendarId !== undefined) {
          const calendar = await prisma.calendar.findFirst({
            where: {
              id: body.calendarId,
              userId: user.id,
            },
          });

          if (!calendar) {
            throw new ValidationError(
              "Invalid calendar or calendar does not belong to user",
              "calendarId",
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
              "categoryId",
            );
          }
        }

        // Validate reminder if provided
        if (body.reminder !== undefined && body.reminder !== null) {
          const reminderValue = Number(body.reminder);
          if (
            isNaN(reminderValue) ||
            reminderValue < 0 ||
            reminderValue > 43200
          ) {
            throw new ValidationError(
              "Reminder must be a number between 0 and 43200 minutes",
              "reminder",
            );
          }
          body.reminder = reminderValue;
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
        if (body.calendarId !== undefined) {
          updateData.calendarId = body.calendarId;
        }
        if (body.categoryId !== undefined) {
          updateData.categoryId = body.categoryId || null;
        }
        if (body.reminder !== undefined) {
          updateData.reminder = body.reminder || null;
        }
        if (body.recurrence !== undefined) {
          if (body.recurrence) {
            try {
              const rule = RecurrenceEngine.parseRecurrenceRule(
                body.recurrence,
              );
              if (!rule) {
                throw new ValidationError(
                  "Invalid recurrence rule format",
                  "recurrence",
                );
              }

              const errors = RecurrenceEngine.validateRecurrenceRule(rule);
              if (errors.length > 0) {
                throw new ValidationError(
                  `Recurrence rule validation failed: ${errors.join(", ")}`,
                  "recurrence",
                );
              }
            } catch (recurrenceError) {
              console.error("Recurrence validation error:", recurrenceError);
              throw new ValidationError(
                "Invalid recurrence rule format",
                "recurrence",
              );
            }
          }
          updateData.recurrence = body.recurrence || null;
        }

        // Add updatedAt for optimistic locking check
        updateData.updatedAt = new Date();

        // Update the event with optimistic locking
        const updatedEvent = await prisma.calendarEvent.update({
          where: {
            id,
            // Optimistic locking: ensure the event hasn't been modified since we fetched it
            updatedAt: existingEvent.updatedAt,
          },
          data: updateData,
          include: {
            category: true,
            calendar: true,
          },
        });

        return updatedEvent;
      } catch (error: any) {
        console.error("Event update error:", error);

        // Handle optimistic locking conflict
        if (
          error.code === "P2025" ||
          error.message.includes("Record to update not found")
        ) {
          throw new ValidationError(
            "Event was modified by another process. Please refresh and try again.",
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
          }),
        ),
        description: t.Optional(
          t.String({
            maxLength: 1000,
            description: "Event description (max 1000 characters)",
          }),
        ),
        start: t.Optional(
          t.String({
            description: "Start date in ISO 8601 format",
          }),
        ),
        end: t.Optional(
          t.String({
            description: "End date in ISO 8601 format",
          }),
        ),
        allDay: t.Optional(
          t.Boolean({
            description: "Whether the event is all-day",
          }),
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
              maximum: 43200, // 30 days in minutes
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
    },
  )

  .delete(
    "/:id",
    async ({ params, user }: any) => {
      try {
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

        // Clean up associated notifications and logs before deleting the event
        await prisma.eventNotification.deleteMany({
          where: { eventId: id },
        });

        await prisma.notificationLog.deleteMany({
          where: { eventId: id },
        });

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
      } catch (error) {
        console.error("Event deletion error:", error);
        throw error;
      }
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
    },
  )

  .post(
    "/bulk",
    async ({ body, user }: any) => {
      try {
        const { action, eventIds, targetCalendarId } = body;

        // Validate event IDs
        if (!eventIds || !Array.isArray(eventIds) || eventIds.length === 0) {
          throw new ValidationError("Event IDs array is required", "eventIds");
        }

        // Verify all events exist and belong to user
        const events = await prisma.calendarEvent.findMany({
          where: {
            id: { in: eventIds },
            userId: user.id,
          },
        });

        if (events.length !== eventIds.length) {
          throw new ValidationError(
            "Some events not found or access denied",
            "eventIds",
          );
        }

        let result;

        switch (action) {
          case "move":
            if (!targetCalendarId) {
              throw new ValidationError(
                "Target calendar ID is required for move operation",
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

            // Move events to target calendar
            result = await prisma.calendarEvent.updateMany({
              where: {
                id: { in: eventIds },
                userId: user.id,
              },
              data: {
                calendarId: targetCalendarId,
                updatedAt: new Date(),
              },
            });

            return {
              success: true,
              message: `Successfully moved ${result.count} events to ${targetCalendar.name}`,
              eventsProcessed: result.count,
              action: "move",
            };

          case "delete":
            // Clean up associated notifications and logs before deleting events
            await prisma.eventNotification.deleteMany({
              where: { eventId: { in: eventIds } },
            });

            await prisma.notificationLog.deleteMany({
              where: { eventId: { in: eventIds } },
            });

            // Delete all specified events
            result = await prisma.calendarEvent.deleteMany({
              where: {
                id: { in: eventIds },
                userId: user.id,
              },
            });

            return {
              success: true,
              message: `Successfully deleted ${result.count} events`,
              eventsProcessed: result.count,
              action: "delete",
            };

          case "duplicate":
            // Duplicate events
            const duplicatedEvents = [];
            for (const event of events) {
              const duplicated = await prisma.calendarEvent.create({
                data: {
                  title: `${event.title} (Copy)`,
                  description: event.description,
                  start: event.start,
                  end: event.end,
                  allDay: event.allDay,
                  location: event.location,
                  color: event.color,
                  isPrivate: event.isPrivate,
                  reminder: event.reminder,
                  recurrence: null, // Don't copy recurrence
                  calendarId: targetCalendarId || event.calendarId,
                  categoryId: event.categoryId,
                  userId: user.id,
                },
                include: {
                  category: true,
                  calendar: true,
                },
              });

              // Create default notifications for the duplicated event
              try {
                await notificationService.createDefaultNotificationsForEvent(
                  duplicated.id,
                  user.id,
                  event.reminder,
                );
              } catch (notificationError) {
                console.error(
                  "Failed to create notifications for duplicated event:",
                  notificationError,
                );
                // Don't fail the duplication if notifications fail
              }

              duplicatedEvents.push(duplicated);
            }

            return {
              success: true,
              message: `Successfully duplicated ${duplicatedEvents.length} events`,
              eventsProcessed: duplicatedEvents.length,
              action: "duplicate",
              createdEvents: duplicatedEvents,
            };

          default:
            throw new ValidationError(
              "Invalid action. Use 'move', 'delete', or 'duplicate'",
              "action",
            );
        }
      } catch (error) {
        console.error("Bulk operation error:", error);
        throw error;
      }
    },
    {
      auth: true,
      body: t.Object({
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
        responses: {
          200: {
            description: "Bulk operation completed successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    message: { type: "string" },
                    eventsProcessed: { type: "number" },
                    action: { type: "string" },
                    createdEvents: {
                      type: "array",
                      description: "New events created (for duplicate action)",
                      items: {
                        type: "object",
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
    },
  );
